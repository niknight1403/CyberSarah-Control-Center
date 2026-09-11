/**
 * Loop Engineering (rein, testbar) — Selbstheilungs-Rahmen für autonome
 * Agent-Ziele. Vier Schutzmechanismen greifen ineinander:
 *
 * 1. Iterations-/Rekursionstiefen-Cap je Ziel (kein Endloslauf).
 * 2. Signatur-basierte Endlos-Schleifen-Erkennung (gleicher Schritt wiederholt sich).
 * 3. Konvergenz-Verifikation: Fortschritts-Trend über ein Fenster von Steps —
 *    ohne messbaren Fortschritt gilt ein Ziel als gestaltet/steckengeblieben.
 * 4. Eskalationsleiter für Fehlschläge: retry → Strategiewechsel → Eskalation → Abbruch.
 *
 * Die Auswertung ist deterministisch (kein Zufall), damit Verhalten und Tests
 * stabil bleiben. Dynamischer Backoff für Retry-Wartezeiten liegt bewusst
 * bei dieser Leiter (nicht beim Queue-Retry aus retry-backoff-logic).
 */

export type GoalRunState =
  | "running"
  | "stalled"
  | "loop_detected"
  | "depth_capped"
  | "converged";

export const LOOP_LIMITS = {
  /** Maximale Schritte je Agent-Ziel, bevor hart abgebrochen wird. */
  defaultMaxIterations: 40,
  /** Wie oft dieselbe Schritt-Signatur vorkommen darf, bevor eine Schleife gilt. */
  signatureRepeatLimit: 3,
  /** Fenstergröße für die Konvergenz-Auswertung. */
  convergenceWindow: 5,
  /** Minimaler Fortschrittsgewinn pro Fenster, der als konvergent zählt. */
  minProgressDelta: 0.02,
  /** Konvergenz-Zielfortschritt (0..1), ab dem ein Ziel als erreicht gilt. */
  convergenceTarget: 0.95,
} as const;

/** Stabile Signatur eines Ausführungsschritts (Normalisierung über Aktion + Ziel). */
export function stepSignature(step: { kind: string; target?: string; summary?: string }): string {
  const kind = step.kind.trim().toLowerCase();
  const target = (step.target ?? step.summary ?? "").trim().toLowerCase();
  return `${kind}::${target}`;
}

export type SignatureLoopResult = {
  detected: boolean;
  repeatedSignature: string | null;
  occurrences: number;
};

/** Erkennt, ob sich eine Schritt-Signatur über dem Limit wiederholt. */
export function detectSignatureLoop(
  signatures: readonly string[],
  repeatLimit: number = LOOP_LIMITS.signatureRepeatLimit,
): SignatureLoopResult {
  const counts = new Map<string, number>();
  let repeated: string | null = null;
  let occurrences = 0;
  for (const signature of signatures) {
    const next = (counts.get(signature) ?? 0) + 1;
    counts.set(signature, next);
    if (next >= repeatLimit && next > occurrences) {
      repeated = signature;
      occurrences = next;
    }
  }
  return { detected: repeated !== null, repeatedSignature: repeated, occurrences };
}

export type ConvergenceVerdict = {
  converged: boolean;
  stalled: boolean;
  trend: "improving" | "stalled" | "insufficient-samples";
  lastDelta: number;
  windowSamples: number;
};

/**
 * Bewertet den Fortschrittsverlauf (0..1 je Schritt). `stalled` heißt: Das
 * aktuelle Fenster bringt weniger Fortschritt als die Mindestdelta-Schwelle —
 * das Ziel driftet nicht weiter Richtung Lösung.
 */
export function evaluateConvergence(
  progressSamples: readonly number[],
  windowSize: number = LOOP_LIMITS.convergenceWindow,
  minDelta: number = LOOP_LIMITS.minProgressDelta,
  target: number = LOOP_LIMITS.convergenceTarget,
): ConvergenceVerdict {
  if (progressSamples.length === 0) {
    return { converged: false, stalled: false, trend: "insufficient-samples", lastDelta: 0, windowSamples: 0 };
  }
  const latest = progressSamples[progressSamples.length - 1];
  if (latest >= target) {
    return { converged: true, stalled: false, trend: "improving", lastDelta: 0, windowSamples: progressSamples.length };
  }
  const window = progressSamples.slice(-windowSize);
  if (window.length < 2) {
    return { converged: false, stalled: false, trend: "insufficient-samples", lastDelta: 0, windowSamples: window.length };
  }
  const lastDelta = window[window.length - 1] - window[0];
  return {
    converged: false,
    stalled: lastDelta < minDelta,
    trend: lastDelta >= minDelta ? "improving" : "stalled",
    lastDelta,
    windowSamples: window.length,
  };
}

/** Deterministischer exponentieller Backoff für Ziel-Retries. */
export function planRetryDelayMs(failureCount: number, baseMs = 500, maxMs = 30_000): number {
  const safeCount = Math.max(failureCount, 1);
  const delay = baseMs * 2 ** (safeCount - 1);
  return Math.min(delay, maxMs);
}

export type LoopDirectiveAction = "continue" | "retry" | "alternate-strategy" | "escalate" | "abort";

export type LoopDirective = {
  action: LoopDirectiveAction;
  reason: string;
  retryDelayMs: number | null;
  state: GoalRunState;
};

export type GoalRunSignals = {
  iterationCount: number;
  maxIterations?: number;
  signatures: readonly string[];
  progressSamples: readonly number[];
  consecutiveFailures: number;
};

/**
 * Zentrale Auswertung je Ausführungsschritt: liefert die Selbstheilungs-
 * Anweisung (weiterlaufen, mit Backoff erneut versuchen, Strategie wechseln,
 * eskalieren oder hart abbrechen) inklusive Ziel-Zustand.
 */
export function nextLoopDirective(signals: GoalRunSignals): LoopDirective {
  const maxIterations = signals.maxIterations ?? LOOP_LIMITS.defaultMaxIterations;
  const depthCapped = signals.iterationCount >= maxIterations;
  const signatureLoop = detectSignatureLoop(signals.signatures);
  const convergence = evaluateConvergence(signals.progressSamples);
  const failures = Math.max(signals.consecutiveFailures, 0);

  if (depthCapped) {
    return {
      action: "abort",
      reason: `Iterations-Cap erreicht (${signals.iterationCount}/${maxIterations})`,
      retryDelayMs: null,
      state: "depth_capped",
    };
  }
  if (convergence.converged) {
    return { action: "continue", reason: "Konvergenz-Ziel erreicht", retryDelayMs: null, state: "converged" };
  }
  if (signatureLoop.detected && convergence.stalled) {
    return {
      action: "alternate-strategy",
      reason: `Endlos-Schleife erkannt (Signatur ${signatureLoop.occurrences}× ohne Fortschritt)`,
      retryDelayMs: null,
      state: "loop_detected",
    };
  }
  if (failures >= 5) {
    return {
      action: "escalate",
      reason: `Fünf aufeinanderfolgende Fehlschläge (${failures})`,
      retryDelayMs: null,
      state: "running",
    };
  }
  if (failures >= 3) {
    return {
      action: "alternate-strategy",
      reason: `Wiederholte Fehlschläge (${failures}) — Ansatz wechseln`,
      retryDelayMs: null,
      state: "running",
    };
  }
  if (failures >= 1) {
    return {
      action: "retry",
      reason: `Fehlschlag (${failures}) — Backoff`,
      retryDelayMs: planRetryDelayMs(failures),
      state: "running",
    };
  }
  if (convergence.stalled) {
    return {
      action: "escalate",
      reason: `Konvergenz stagniert (Δ ${convergence.lastDelta.toFixed(3)} < Schwelle)`,
      retryDelayMs: null,
      state: "stalled",
    };
  }
  return { action: "continue", reason: "Fortschritt messbar", retryDelayMs: null, state: "running" };
}

/**
 * Sprint 352 — Agentic Execution & Reflection Loop: Zustandsmaschine.
 * Reine, deterministische Logik (kein IO): Iterations-Historie,
 * Konfidenz-Verfall, strukturierte Reflexions-Rueckmeldung und harte
 * Halte-Grenzen (max_loops, Timeout, Token-Budget, Mindest-Konfidenz).
 * Der Koordinator (server/agentic-loop-coordinator.ts) nutzt diese
 * Funktionen als einzige Wahrheitsquelle fuer Zustaende und Uebergaenge.
 */
import { extractJsonObject } from "./json-extract-logic";

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

export type AgenticLoopStatus =
  | "running"
  | "succeeded"
  | "halted_max_loops"
  | "halted_timeout"
  | "halted_token_budget"
  | "failed";

export type AgenticLoopConfig = {
  maxLoops: number;
  timeoutMs: number;
  maxTotalTokens: number;
  minConfidence: number;
};

export const DEFAULT_AGENTIC_LOOP_CONFIG: AgenticLoopConfig = {
  maxLoops: 4,
  timeoutMs: 30_000,
  maxTotalTokens: 200_000,
  minConfidence: 0.7,
};

/** Hart geklemmte Konfiguration: keine unsinnigen Werte erreichen die Schleife. */
export function normalizeAgenticLoopConfig(raw: Partial<AgenticLoopConfig>): AgenticLoopConfig {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    typeof value === "number" && !Number.isNaN(value)
      ? Math.min(max, Math.max(min, Math.floor(value)))
      : fallback;
  return {
    maxLoops: clamp(raw.maxLoops ?? DEFAULT_AGENTIC_LOOP_CONFIG.maxLoops, 1, 16, DEFAULT_AGENTIC_LOOP_CONFIG.maxLoops),
    timeoutMs: clamp(raw.timeoutMs ?? DEFAULT_AGENTIC_LOOP_CONFIG.timeoutMs, 100, 600_000, DEFAULT_AGENTIC_LOOP_CONFIG.timeoutMs),
    maxTotalTokens: clamp(raw.maxTotalTokens ?? DEFAULT_AGENTIC_LOOP_CONFIG.maxTotalTokens, 100, 100_000_000, DEFAULT_AGENTIC_LOOP_CONFIG.maxTotalTokens),
    minConfidence: (() => {
      const value = raw.minConfidence ?? DEFAULT_AGENTIC_LOOP_CONFIG.minConfidence;
      return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_AGENTIC_LOOP_CONFIG.minConfidence;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Validierungs-Middleware (zwischen den Zyklen)
// ---------------------------------------------------------------------------

export type ValidationOutcome = {
  valid: boolean;
  errors: string[];
  /** Konfidenz 0..1, die das Ergebnis in DIESEM Durchgang verdient. */
  confidence: number;
};

export type OutputValidator = {
  name: string;
  validate: (output: string) => ValidationOutcome;
};

/** JSON-Gueteprobe: nutzt den erprobten extractJsonObject-Parser (Sprint 350). */
export function jsonOutputValidator(): OutputValidator {
  return {
    name: "json",
    validate: (output: string): ValidationOutcome => {
      const parsed = extractJsonObject(output);
      if (!parsed) {
        return { valid: false, errors: ["Ausgabe ist kein gueltiges JSON-Objekt (oder kein JSON im Text gefunden)."], confidence: 0 };
      }
      return { valid: true, errors: [], confidence: 0.8 };
    },
  };
}

/** Struktur-Pruefung: benannte Pflicht-Felder mit Typ-Erwartung. */
export function structureValidator(rules: readonly { key: string; type: "string" | "number" | "boolean" | "object" | "array" }[]): OutputValidator {
  return {
    name: "structure",
    validate: (output: string): ValidationOutcome => {
      const parsed = extractJsonObject(output);
      if (!parsed) {
        return { valid: false, errors: ["Strukturpruefung uebersprungen: kein JSON-Objekt parsebar."], confidence: 0 };
      }
      const errors: string[] = [];
      for (const rule of rules) {
        const value = parsed[rule.key];
        if (value === undefined || value === null) {
          errors.push(`Pflichtfeld "${rule.key}" fehlt.`);
          continue;
        }
        const matches =
          (rule.type === "array" && Array.isArray(value)) ||
          (rule.type !== "array" && rule.type !== "object" && typeof value === rule.type) ||
          (rule.type === "object" && typeof value === "object" && !Array.isArray(value));
        if (!matches) errors.push(`Feld "${rule.key}" hat Typ ${Array.isArray(value) ? "array" : typeof value}, erwartet ${rule.type}.`);
      }
      return { valid: errors.length === 0, errors, confidence: errors.length === 0 ? 1 : 0.2 };
    },
  };
}

/** Kombiniert mehrere Validatoren zu einer Middleware-Stufe. */
export function combineValidators(validators: readonly OutputValidator[]): OutputValidator {
  return {
    name: validators.map((validator) => validator.name).join("+") || "empty",
    validate: (output: string): ValidationOutcome => {
      const errors: string[] = [];
      let confidence = 1;
      for (const validator of validators) {
        const outcome = validator.validate(output);
        errors.push(...outcome.errors.map((error) => `[${validator.name}] ${error}`));
        confidence = Math.min(confidence, outcome.valid ? outcome.confidence : outcome.confidence);
      }
      return { valid: errors.length === 0, errors, confidence };
    },
  };
}

// ---------------------------------------------------------------------------
// Zustand & Uebergaenge
// ---------------------------------------------------------------------------

export type LoopIterationRecord = {
  iteration: number;
  valid: boolean;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  errors: string[];
  agentError: string | null;
};

export type AgenticLoopState = {
  status: AgenticLoopStatus;
  iteration: number;
  history: LoopIterationRecord[];
  confidence: number;
  tokensUsed: number;
  elapsedMs: number;
  lastOutput: string | null;
  haltedReason: string | null;
  /** Strukturierte Rueckmeldung fuer den NAECHSTEN Agenten-Aufruf. */
  reflectionContext: string[];
};

export function initAgenticLoopState(): AgenticLoopState {
  return {
    status: "running",
    iteration: 0,
    history: [],
    confidence: 0,
    tokensUsed: 0,
    elapsedMs: 0,
    lastOutput: null,
    haltedReason: null,
    reflectionContext: [],
  };
}

/**
 * Konfidenz-Verfall: ungueltige Durchgaenge verbuchen Strafe, gültige
 * behalten ihre Basis; jeder zusaetzliche Versuch reduziert die Start-
 * basis um 10 % pro vorherigem Fehlversuch (Selbstkorrektur wird
 * belohnt, endloses Nachbessern wird teurer).
 */
export function computeIterationConfidence(baseConfidence: number, failedIterations: number): number {
  const decay = Math.pow(0.9, failedIterations);
  return Math.min(1, Math.max(0, baseConfidence * decay));
}

export type IterationOutcome = {
  output: string;
  tokensUsed: number;
  durationMs: number;
  validation: ValidationOutcome;
  agentError: string | null;
};

/**
 * Ein Zyklus: haengt das Ergebnis an die Historie, entscheidet den Folgezustand
 * und baut die Reflexions-Rueckmeldung fuer die naechste Iteration auf.
 * Reine Funktion — der Koordinator fuehrt sie nur mit echten Messwerten aus.
 */
export function stepAgenticLoop(state: AgenticLoopState, config: AgenticLoopConfig, outcome: IterationOutcome): AgenticLoopState {
  if (state.status !== "running") return state;
  const failedBefore = state.history.filter((entry) => !entry.valid).length;
  const confidence = outcome.agentError ? 0 : computeIterationConfidence(outcome.validation.confidence, failedBefore);

  const record: LoopIterationRecord = {
    iteration: state.iteration + 1,
    valid: outcome.agentError === null && outcome.validation.valid,
    confidence,
    tokensUsed: outcome.tokensUsed,
    durationMs: outcome.durationMs,
    errors: outcome.validation.errors,
    agentError: outcome.agentError,
  };

  const next: AgenticLoopState = {
    ...state,
    iteration: record.iteration,
    history: [...state.history, record],
    confidence,
    tokensUsed: state.tokensUsed + outcome.tokensUsed,
    elapsedMs: state.elapsedMs + outcome.durationMs,
    lastOutput: outcome.agentError === null ? outcome.output : state.lastOutput,
    reflectionContext: [],
  };

  // 1) Erfolg: valide + Konfidenz-Schwelle erreicht.
  if (record.valid && confidence >= config.minConfidence) {
    return { ...next, status: "succeeded" };
  }

  // 2) Harte Grenzen — Reihenfolge ist bewusst: Loops, Token, Timeout.
  if (next.iteration >= config.maxLoops) {
    return {
      ...next,
      status: "halted_max_loops",
      haltedReason: `max_loops erreicht (${config.maxLoops}) ohne gueltiges Ergebnis mit Konfidenz >= ${config.minConfidence}.`,
    };
  }
  if (next.tokensUsed >= config.maxTotalTokens) {
    return { ...next, status: "halted_token_budget", haltedReason: `Token-Budget aufgebraucht (${next.tokensUsed} >= ${config.maxTotalTokens}).` };
  }
  if (next.elapsedMs >= config.timeoutMs) {
    return { ...next, status: "halted_timeout", haltedReason: `Timeout erreicht (${next.elapsedMs} ms >= ${config.timeoutMs} ms).` };
  }

  // 3) Weiterlaufen: Fehler als strukturierter Kontext zurueckspielen.
  return { ...next, reflectionContext: buildReflectionContext(next, record) };
}

/** Strukturierte Reflexions-Rueckmeldung (Eingabe fuer Iteration N+1). */
export function buildReflectionContext(state: AgenticLoopState, lastRecord: LoopIterationRecord): string[] {
  const context: string[] = [];
  context.push(`Iteration ${lastRecord.iteration} war ungueltig (Konfidenz ${lastRecord.confidence.toFixed(2)}).`);
  if (lastRecord.agentError) {
    context.push(`Agent-Fehler: ${lastRecord.agentError}`);
  }
  for (const error of lastRecord.errors) {
    context.push(`Validierungsfehler: ${error}`);
  }
  const previousErrors = [...new Set(state.history.slice(0, -1).flatMap((entry) => entry.errors))];
  if (previousErrors.length > 0) {
    context.push(`Fehler frueherer Iterationen (wiederhole nicht dieselbe Ausgabe): ${previousErrors.join(" | ")}`);
  }
  context.push("Korrigiere die Ausgabe gezielt anhand der genannten Fehler und liefere erneut.");
  return context;
}

/** Soll die Schleife nach diesem Zustand noch eine Iteration starten? */
export function shouldContinue(state: AgenticLoopState, config: AgenticLoopConfig, nowElapsedMs: number): boolean {
  if (state.status !== "running") return false;
  if (state.iteration >= config.maxLoops) return false;
  if (state.tokensUsed >= config.maxTotalTokens) return false;
  if (nowElapsedMs >= config.timeoutMs) return false;
  return true;
}

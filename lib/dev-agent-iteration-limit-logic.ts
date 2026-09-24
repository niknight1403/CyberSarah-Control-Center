/**
 * Sprint 288 — Iterations-Limits ehrlich: Konfigurierbare & dokumentierte Grenzen für Tool-Iterationen.
 *
 * Verhindert endlose Werkzeugschleifen im Dev-Agenten durch ehrliche,
 * transparente Schwellenwerte, Warnhinweise und konfigurierbare Iterations-Limits.
 * Pure, deterministische Logik.
 */

export interface IterationLimitConfig {
  maxIterations: number;
  warningThreshold: number;
  allowOverride: boolean;
}

export const DEFAULT_ITERATION_LIMIT_CONFIG: IterationLimitConfig = {
  maxIterations: 8,
  warningThreshold: 6,
  allowOverride: true,
};

export interface IterationStep {
  iteration: number;
  toolName: string;
  timestampMs: number;
}

export interface IterationTracker {
  currentIteration: number;
  config: IterationLimitConfig;
  history: IterationStep[];
}

export function sanitizeIterationConfig(customConfig?: Partial<IterationLimitConfig>): IterationLimitConfig {
  const max = typeof customConfig?.maxIterations === "number" && Number.isFinite(customConfig.maxIterations)
    ? Math.min(Math.max(1, Math.round(customConfig.maxIterations)), 20)
    : DEFAULT_ITERATION_LIMIT_CONFIG.maxIterations;

  const warn = typeof customConfig?.warningThreshold === "number" && Number.isFinite(customConfig.warningThreshold)
    ? Math.min(Math.max(1, Math.round(customConfig.warningThreshold)), max)
    : Math.min(DEFAULT_ITERATION_LIMIT_CONFIG.warningThreshold, max);

  const override = customConfig?.allowOverride ?? DEFAULT_ITERATION_LIMIT_CONFIG.allowOverride;

  return {
    maxIterations: max,
    warningThreshold: warn,
    allowOverride: override,
  };
}

export function createIterationTracker(customConfig?: Partial<IterationLimitConfig>): IterationTracker {
  const config = sanitizeIterationConfig(customConfig);
  return {
    currentIteration: 0,
    config,
    history: [],
  };
}

export function checkIterationLimit(tracker: IterationTracker): {
  allowed: boolean;
  remaining: number;
  isWarning: boolean;
  limitReason?: string;
} {
  const { currentIteration, config } = tracker;
  const remaining = Math.max(0, config.maxIterations - currentIteration);
  const isWarning = currentIteration >= config.warningThreshold && currentIteration < config.maxIterations;

  if (currentIteration >= config.maxIterations) {
    return {
      allowed: false,
      remaining: 0,
      isWarning: false,
      limitReason: `Maximale Werkzeug-Iterationen (${config.maxIterations}) für diesen Task erreicht.`,
    };
  }

  return {
    allowed: true,
    remaining,
    isWarning,
  };
}

export function recordIterationStep(
  tracker: IterationTracker,
  toolName: string,
  nowMs?: number
): {
  updatedTracker: IterationTracker;
  warningMessage?: string;
} {
  const now = nowMs ?? Date.now();
  const nextIteration = tracker.currentIteration + 1;

  const step: IterationStep = {
    iteration: nextIteration,
    toolName: toolName.trim(),
    timestampMs: now,
  };

  const updatedTracker: IterationTracker = {
    ...tracker,
    currentIteration: nextIteration,
    history: [...tracker.history, step],
  };

  const limitCheck = checkIterationLimit(updatedTracker);
  let warningMessage: string | undefined;

  if (limitCheck.isWarning) {
    warningMessage = `Achtung: Werkzeug-Iteration ${nextIteration} von max. ${tracker.config.maxIterations} erreicht (${limitCheck.remaining} verbleibend).`;
  }

  return {
    updatedTracker,
    warningMessage,
  };
}

export function getIterationLimitDocumentation(): string {
  return `
### Ehrliche Grenzen für Dev-Agent Werkzeug-Iterationen

1. **Standard-Limit:** Maximal 8 Werkzeug-Aufrufe pro Benutzeraufgabe (konfigurierbar zwischen 1 und 20).
2. **Warnschwelle:** Ab der 6. Iteration erhält der Agent ein Warnsignal, um Aufgaben zügig abzuschließen.
3. **Schutz vor Endlosschleifen:** Bei Erreichen des Limits bricht der Agent die automatische Werkzeugausführung ab und meldet den bisherigen Zwischenstand ehrlich an den Nutzer.
4. **Transparenz:** Jeder Werkzeugaufruf wird mit Zeitstempel und Werkzeugname protokolliert.
`.trim();
}

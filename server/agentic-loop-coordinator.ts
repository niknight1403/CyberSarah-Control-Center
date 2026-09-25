/**
 * Sprint 352 — Agentic Execution & Reflection Loop: Koordinator.
 * Fuehrt mehrstufige Agenten-Workflows aus und treibt die Zustandsmaschine
 * aus lib/agentic-loop-logic.ts mit echten Messwerten (Tokens, Dauer).
 * Sicherheits-Architektur:
 *  - Der Agenten-Schritt ist INJIZIERT (kein LLM-Hardcode): Produktiv kann
 *    die Ollama-Fleet/Gratis-Kette haengen, Tests steuern deterministische
 *    Skripte — die Zustandsuebergaenge bleiben identisch getestet.
 *  - Timeout: jede Iteration rennt per Promise.race gegen die REST-Zeit
 *    des Gesamtbudgets; Restzeit <= 0 haelt die Schleife hart.
 *  - Resilienz: Agent-Ausnahmen werden als fehlgeschlagene Iteration
 *    verbucht (mit Reflexionskontext fuer den Naechstversuch), erst
 *    maxAgentErrors aufeinanderfolgende Abstuerze beenden mit "failed".
 */
import {
  buildReflectionContext,
  initAgenticLoopState,
  normalizeAgenticLoopConfig,
  shouldContinue,
  stepAgenticLoop,
  type AgenticLoopConfig,
  type AgenticLoopState,
  type IterationOutcome,
  type OutputValidator,
} from "../lib/agentic-loop-logic";

export type AgentStepFn = (
  iteration: number,
  reflectionContext: string[],
  remainingMs: number,
) => Promise<{ output: string; tokensUsed: number }>;

export type CoordinatorOptions = Partial<AgenticLoopConfig> & {
  maxAgentErrors?: number;
  validate: OutputValidator;
  agentStep: AgentStepFn;
  /** Injizierbare Uhr fuer deterministische Tests; Produktiv: Date.now. */
  now?: () => number;
};

export type AgenticLoopRunResult = {
  state: AgenticLoopState;
  iterations: number;
  totalTokens: number;
  totalDurationMs: number;
};

export async function runAgenticLoop(options: CoordinatorOptions): Promise<AgenticLoopRunResult> {
  const config = normalizeAgenticLoopConfig(options);
  const maxAgentErrors = Math.max(1, options.maxAgentErrors ?? 2);
  const now = options.now ?? Date.now;

  let state = initAgenticLoopState();
  const startedAt = now();
  let consecutiveAgentErrors = 0;

  while (shouldContinue(state, config, now() - startedAt)) {
    const remainingMs = config.timeoutMs - Math.max(now() - startedAt, state.elapsedMs);

    let output = "";
    let tokensUsed = 0;
    let durationMs = 0;
    let agentError: string | null = null;

    const iterationStartedAt = now();
    try {
      const stepResult = await withTimeout(
        options.agentStep(state.iteration + 1, state.reflectionContext, remainingMs),
        remainingMs,
      );
      output = stepResult.output;
      tokensUsed = Math.max(0, Math.floor(stepResult.tokensUsed));
    } catch (error) {
      if (remainingMs <= 0) {
        // Zeitbudget war VOR Iterationsstart aufgebraucht: das ist kein
        // Agenten-Fehler, sondern ein sauberer Timeout-Halt.
        state = {
          ...state,
          status: "halted_timeout",
          elapsedMs: now() - startedAt,
          haltedReason: `Timeout erreicht (${now() - startedAt} ms >= ${config.timeoutMs} ms) — keine weitere Iteration gestartet.`,
        };
        break;
      }
      agentError = error instanceof Error ? error.message : String(error);
      // Ein Absturz verbucht realistische Mindest-Kosten, damit ein
      // endlos abstuerzender Agent das Token-/Loop-Budget trotzdem reizt.
      tokensUsed = 250;
    }
    durationMs = Math.max(0, now() - iterationStartedAt);

    const validation = agentError
      ? { valid: false, errors: [], confidence: 0 }
      : options.validate.validate(output);

    state = stepAgenticLoop(state, config, {
      output,
      tokensUsed,
      durationMs,
      validation,
      agentError,
    } satisfies IterationOutcome);

    // Resilienz-Buchhaltung: aufeinanderfolgende Abstuerze beenden hart.
    if (agentError) {
      consecutiveAgentErrors += 1;
      if (consecutiveAgentErrors >= maxAgentErrors) {
        state = {
          ...state,
          status: "failed",
          haltedReason: `${consecutiveAgentErrors} aufeinanderfolgende Agent-Fehler (Limit ${maxAgentErrors}).`,
        };
        break;
      }
    } else {
      consecutiveAgentErrors = 0;
    }

    // Sicherheitsnetz: sollteContinue() hat die Vorbedingung geprueft,
    // aber die gerade beendete Iteration kann das Budget aufgezehrt haben —
    // die Maschine hat das bereits in stepAgenticLoop verbucht; hier bleibt
    // nur der Lauf-Abbruch, wenn Reflextion nach Zyklus 1 noch fehlt.
    if (state.status === "running" && state.reflectionContext.length === 0) {
      state = { ...state, reflectionContext: buildReflectionContext(state, state.history[state.history.length - 1]) };
    }
  }

  // Nachlauf: sollteContinue() kann die Schleife wegen Timeout verlassen haben,
  // ohne dass die Maschine es verbuchen konnte — dann explizit nachziehen.
  if (state.status === "running") {
    const elapsed = now() - startedAt;
    if (state.iteration >= config.maxLoops) {
      state = { ...state, status: "halted_max_loops", haltedReason: `max_loops erreicht (${config.maxLoops}).` };
    } else if (state.tokensUsed >= config.maxTotalTokens) {
      state = { ...state, status: "halted_token_budget", haltedReason: `Token-Budget aufgebraucht (${state.tokensUsed}).` };
    } else if (elapsed >= config.timeoutMs) {
      state = { ...state, status: "halted_timeout", haltedReason: `Timeout erreicht (${elapsed} ms >= ${config.timeoutMs} ms).` };
    } else {
      state = { ...state, status: "failed", haltedReason: `Schleife uneroeffnet beendet (unerwarteter Zustand nach ${elapsed} ms).` };
    }
  }

  return {
    state,
    iterations: state.iteration,
    totalTokens: state.tokensUsed,
    totalDurationMs: state.elapsedMs,
  };
}

/** Promise.race-Guard: laufende Schritte hart abbrechen, Restzeit <= 0 sofort. */
async function withTimeout<T>(promise: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) {
    throw new Error(`Zeitbudget aufgebraucht (${remainingMs} ms Rest) — Iteration nicht gestartet.`);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Iteration-Timeout nach ${remainingMs} ms.`)), remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sprint 353 — Agentic-Loop-Telemetrie: reine Event-Logik.
 * Strukturierte Telemetrie-Payloads fuer alle Lebenszyklus-Punkte des
 * Loops (start, iteration, reflexion/validation, terminal) inkl.
 * Sequenz-Invarianten und Replay-Semantik (Last-Event-ID). Der Bus
 * (server/agentic-loop-telemetry.ts) und der SSE-Endpunkt nutzen NUR
 * diese Funktionen — der Koordinator bleibt unangetastet wrap-bar.
 */
import type { AgenticLoopConfig, AgenticLoopState, LoopIterationRecord } from "./agentic-loop-logic";

export type AgenticLoopEventName =
  | "loop:start"
  | "iteration:start"
  | "validation:success"
  | "reflection:failed"
  | "loop:complete"
  | "loop:max_reached";

export type AgenticLoopEvent = {
  id: number;
  sessionId: string;
  at: string;
  event: AgenticLoopEventName;
  payload: Record<string, unknown>;
};

/** Sichere Session-IDs: [a-zA-Z0-9-_], 4..64 Zeichen — keine Pfad-/Injektionstricks. */
export function isValidLoopSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9_-]{4,64}$/.test(sessionId);
}

export function buildLoopStartEvent(sessionId: string, config: AgenticLoopConfig, task: string): Omit<AgenticLoopEvent, "id"> {
  return {
    sessionId,
    at: new Date().toISOString(),
    event: "loop:start",
    payload: {
      task: task.slice(0, 400),
      maxLoops: config.maxLoops,
      timeoutMs: config.timeoutMs,
      maxTotalTokens: config.maxTotalTokens,
      minConfidence: config.minConfidence,
    },
  };
}

export function buildIterationStartEvent(sessionId: string, iteration: number, reflectionContext: string[]): Omit<AgenticLoopEvent, "id"> {
  return {
    sessionId,
    at: new Date().toISOString(),
    event: "iteration:start",
    payload: { iteration, reflectionContext: reflectionContext.slice(0, 12), agentInput: reflectionContext.join(" | ").slice(0, 600) },
  };
}

export function buildValidationSuccessEvent(sessionId: string, record: LoopIterationRecord, output: string): Omit<AgenticLoopEvent, "id"> {
  return {
    sessionId,
    at: new Date().toISOString(),
    event: "validation:success",
    payload: {
      iteration: record.iteration,
      confidence: record.confidence,
      tokensUsed: record.tokensUsed,
      durationMs: record.durationMs,
      outputPreview: output.slice(0, 400),
    },
  };
}

export function buildReflectionFailedEvent(sessionId: string, record: LoopIterationRecord, reflectionContext: string[]): Omit<AgenticLoopEvent, "id"> {
  return {
    sessionId,
    at: new Date().toISOString(),
    event: "reflection:failed",
    payload: {
      iteration: record.iteration,
      confidence: record.confidence,
      errors: record.errors.slice(0, 12),
      agentError: record.agentError,
      feedback: reflectionContext.slice(0, 12),
    },
  };
}

/**
 * Terminal-Event: Erfolg -> loop:complete; Grenz-Erschoepfung
 * (max_loops/Timeout/Token-Budget/failed) -> loop:max_reached.
 */
export function buildTerminalEvent(sessionId: string, state: AgenticLoopState): Omit<AgenticLoopEvent, "id"> {
  const succeeded = state.status === "succeeded";
  return {
    sessionId,
    at: new Date().toISOString(),
    event: succeeded ? "loop:complete" : "loop:max_reached",
    payload: {
      status: state.status,
      iterations: state.iteration,
      confidence: state.confidence,
      totalTokens: state.tokensUsed,
      totalDurationMs: state.elapsedMs,
      haltedReason: state.haltedReason,
      finalOutput: succeeded ? state.lastOutput?.slice(0, 2_000) ?? null : null,
    },
  };
}

/** Replay: alle Events mit id > sinceEventId (Reconnect-Sicherheit). */
export function replayLoopEvents(events: readonly AgenticLoopEvent[], sinceEventId: number): AgenticLoopEvent[] {
  return events.filter((event) => event.id > sinceEventId);
}

/**
 * Sequenz-Invarianten fuer Tests und Server-Selbstcheck:
 *  - genau EIN loop:start am Anfang,
 *  - zu jedem iteration:start N+1 folgt genau ein validation/reflection-Ergebnis,
 *  - Iterationsnummern sind streng monoton steigend,
 *  - genau EIN Terminal-Event am Ende (complete ODER max_reached).
 */
export function assertLoopEventSequence(events: readonly AgenticLoopEvent[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (events.length === 0) return { ok: false, problems: ["Event-Sequenz ist leer."] };
  if (events[0].event !== "loop:start") problems.push(`Erstes Event ist ${events[0].event}, erwartet loop:start.`);
  if (events.filter((event) => event.event === "loop:start").length !== 1) problems.push("loop:start muss genau einmal vorkommen.");
  const terminals = events.filter((event) => event.event === "loop:complete" || event.event === "loop:max_reached");
  if (terminals.length !== 1) problems.push(`Erwartet genau 1 Terminal-Event, gefunden ${terminals.length}.`);
  if (terminals.length === 1 && events[events.length - 1].event !== terminals[0].event) problems.push("Terminal-Event muss das letzte Event sein.");

  const resultEvents = events.filter((event) => event.event === "validation:success" || event.event === "reflection:failed");
  const startEvents = events.filter((event) => event.event === "iteration:start");
  if (resultEvents.length !== startEvents.length) {
    problems.push(`Jede Iteration braucht ein Ergebnis-Event: ${startEvents.length} Starts vs. ${resultEvents.length} Ergebnisse.`);
  }
  let lastIteration = 0;
  for (const start of startEvents) {
    const iteration = Number(start.payload.iteration);
    if (!Number.isInteger(iteration) || iteration <= lastIteration) {
      problems.push(`Iterationsnummern muessen strikt steigen (letzte ${lastIteration}, diese ${iteration}).`);
      break;
    }
    lastIteration = iteration;
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Sprint 354 — Agent-Loop-Stream: reine Client-Logik.
 * Inkrementeller SSE-Parser (Frames koennen ueber Chunks hinweg
 * zerrissen sein), Reconnect-Backoff, Event-Dedupe (Replay-Overlap)
 * und das UI-View-Model (Phase, Iterationszaehler, Konfidenz,
 * Feedback-Trail). Der Hook (hooks/use-agent-loop-stream.ts) und die
 * Panel-Komponente nutzen NUR diese Funktionen — getestet und
 * deterministisch ohne jedes Netzwerk.
 */

export type AgentLoopEventName =
  | "loop:start"
  | "iteration:start"
  | "validation:success"
  | "reflection:failed"
  | "loop:complete"
  | "loop:max_reached";

export type AgentLoopStreamEvent = {
  id: number;
  at: string;
  event: AgentLoopEventName;
  payload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// SSE-Parser (inkrementell)
// ---------------------------------------------------------------------------

export type ParsedSseFrame = {
  id: number | null;
  event: string | null;
  data: unknown;
};

/**
 * Verarbeitet chunkweise ankommenden SSE-Text. Ein Frame ist durch eine
 * Leerzeile abgeschlossen; unvollstaendige Reste bleiben im Puffer.
 * Kommentarzeilen (":"-Praefix, Heartbeats) werden ignoriert.
 */
export function parseSseChunk(buffer: string, chunk: string): { frames: ParsedSseFrame[]; rest: string } {
  const text = `${buffer}${chunk}`;
  const parts = text.split(/\n\n|\r\n\r\n/);
  const rest = parts.pop() ?? "";
  const frames: ParsedSseFrame[] = [];
  for (const part of parts) {
    const frame = parseSseFrame(part);
    if (frame) frames.push(frame);
  }
  return { frames, rest };
}

function parseSseFrame(raw: string): ParsedSseFrame | null {
  const lines = raw.split(/\n|\r\n/);
  let id: number | null = null;
  let event: string | null = null;
  let dataRaw: string | null = null;
  for (const line of lines) {
    if (line.startsWith(":")) continue; // Heartbeat/Pragma
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).replace(/^ /, "");
    if (field === "id" && Number.isFinite(Number(value))) id = Number(value);
    if (field === "event") event = value;
    if (field === "data") dataRaw = dataRaw === null ? value : `${dataRaw}\n${value}`;
  }
  if (event === null && dataRaw === null) return null;
  let data: unknown = dataRaw;
  if (typeof dataRaw === "string") {
    try {
      data = JSON.parse(dataRaw);
    } catch {
      data = dataRaw; // Plaintext-Event unveraendert durchreichen
    }
  }
  return { id, event, data };
}

/** Filtert Backend-Events: nur bekannte Loop-Events mit gueltiger ID. */
export function normalizeAgentLoopFrame(frame: ParsedSseFrame): AgentLoopStreamEvent | null {
  if (frame.event === null || frame.id === null) return null;
  if (typeof frame.data !== "object" || frame.data === null || Array.isArray(frame.data)) return null;
  const record = frame.data as Record<string, unknown>;
  const known: AgentLoopEventName[] = ["loop:start", "iteration:start", "validation:success", "reflection:failed", "loop:complete", "loop:max_reached"];
  if (!known.includes(frame.event as AgentLoopEventName)) return null;
  const payload = (typeof record.payload === "object" && record.payload !== null && !Array.isArray(record.payload)
    ? record.payload
    : {}) as Record<string, unknown>;
  return {
    id: frame.id,
    at: typeof record.at === "string" ? record.at : new Date().toISOString(),
    event: frame.event as AgentLoopEventName,
    payload,
  };
}

/** Haengt ein Event dedupliziert (Replay-Overlap) und id-sortiert an. */
export function appendLoopEvent(events: readonly AgentLoopStreamEvent[], incoming: AgentLoopStreamEvent, cap = 240): AgentLoopStreamEvent[] {
  if (events.some((event) => event.id === incoming.id)) return [...events];
  const next = [...events, incoming].sort((a, b) => a.id - b.id);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// ---------------------------------------------------------------------------
// Reconnect-Backoff
// ---------------------------------------------------------------------------

/** Exponentiell 1s → 16s, deterministisch (kein Jitter im Test). */
export function reconnectDelayMs(attempt: number): number {
  const safe = Math.max(1, Math.floor(attempt));
  return Math.min(16_000, 1_000 * 2 ** Math.min(safe - 1, 4));
}

// ---------------------------------------------------------------------------
// UI-View-Model
// ---------------------------------------------------------------------------

export type AgentLoopPhase = "idle" | "thinking" | "reflecting" | "validating" | "success" | "failed";

export const AGENT_LOOP_PHASE_LABEL: Record<AgentLoopPhase, string> = {
  idle: "BEREIT",
  thinking: "DENKT NACH",
  reflecting: "REFLEKTIERT",
  validating: "VALIDIERT",
  success: "ERFOLG",
  failed: "GESTOPPT",
};

export type LoopTrailEntry = {
  id: number;
  at: string;
  kind: "info" | "error" | "success" | "terminal";
  label: string;
  detail: string;
};

export type AgentLoopViewModel = {
  phase: AgentLoopPhase;
  statusLabel: string;
  iteration: number;
  iterationLabel: string;
  maxLoops: number | null;
  confidencePct: number;
  terminal: boolean;
  lastEventId: number | null;
  trail: LoopTrailEntry[];
};

/** Phase aus der letzten wirksamen Event-Art (Status-Badge). */
export function deriveAgentLoopPhase(events: readonly AgentLoopStreamEvent[]): AgentLoopPhase {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    switch (events[index].event) {
      case "loop:start":
        return "thinking";
      case "iteration:start":
        return events[index].payload.iteration === 1 ? "thinking" : "reflecting";
      case "validation:success":
        return "validating";
      case "reflection:failed":
        return "reflecting";
      case "loop:complete":
        return "success";
      case "loop:max_reached":
        return "failed";
    }
  }
  return "idle";
}

function trailDetail(event: AgentLoopStreamEvent): string {
  const payload = event.payload;
  switch (event.event) {
    case "loop:start":
      return `Aufgabe: ${String(payload.task ?? "—")} · max_loops ${String(payload.maxLoops ?? "?")}`;
    case "iteration:start": {
      const input = typeof payload.agentInput === "string" ? payload.agentInput : "";
      return input.length > 0 ? `Agent-Input: ${input.slice(0, 160)}` : "Erster Versuch ohne Vorfeedback.";
    }
    case "validation:success":
      return `Konfidenz ${Math.round(Number(payload.confidence ?? 0) * 100)} % · ${String(payload.outputPreview ?? "").slice(0, 120)}`;
    case "reflection:failed": {
      const errors = Array.isArray(payload.errors) ? payload.errors.join("; ") : "unbekannter Fehler";
      const agentError = typeof payload.agentError === "string" && payload.agentError.length > 0 ? ` · Agent-Fehler: ${payload.agentError}` : "";
      return `${errors}${agentError}`;
    }
    case "loop:complete":
      return `Fertig in ${String(payload.iterations ?? "?")} Iterationen · ${String(payload.totalTokens ?? "?")} Tokens`;
    case "loop:max_reached":
      return String(payload.haltedReason ?? `Limit erreicht nach ${String(payload.iterations ?? "?")} Iterationen.`);
    default:
      return "";
  }
}

/** Baut das komplette UI-Model aus der (deduplizierten) Event-Liste. */
export function buildAgentLoopViewModel(events: readonly AgentLoopStreamEvent[], trailCap = 60): AgentLoopViewModel {
  const start = events.find((event) => event.event === "loop:start");
  const maxLoops = start && Number.isFinite(Number(start.payload.maxLoops)) ? Number(start.payload.maxLoops) : null;
  const iterationEvents = events.filter((event) => event.event === "iteration:start");
  const iteration = iterationEvents.length > 0 ? Number(iterationEvents[iterationEvents.length - 1].payload.iteration ?? 0) : 0;
  const last = events[events.length - 1];
  const terminal = last?.event === "loop:complete" || last?.event === "loop:max_reached";
  const confidenceSource = [...events].reverse().find((event) => Number.isFinite(Number(event.payload.confidence)));
  const confidencePct = confidenceSource ? Math.max(0, Math.min(100, Math.round(Number(confidenceSource.payload.confidence) * 100))) : 0;

  const trail: LoopTrailEntry[] = events.map((event) => ({
    id: event.id,
    at: event.at,
    kind:
      event.event === "reflection:failed"
        ? "error"
        : event.event === "loop:complete"
          ? "success"
          : event.event === "loop:max_reached"
            ? "terminal"
            : "info",
    label: event.event,
    detail: trailDetail(event),
  }));

  const iterationLabel =
    iteration > 0 && maxLoops !== null
      ? `Iteration ${Math.min(iteration, maxLoops)} von ${maxLoops}`
      : iteration > 0
        ? `Iteration ${iteration}`
        : "Warte auf ersten Durchlauf";

  return {
    phase: deriveAgentLoopPhase(events),
    statusLabel: AGENT_LOOP_PHASE_LABEL[deriveAgentLoopPhase(events)],
    iteration,
    iterationLabel,
    maxLoops,
    confidencePct,
    terminal,
    lastEventId: last?.id ?? null,
    trail: trail.length > trailCap ? trail.slice(trail.length - trailCap) : trail,
  };
}

/**
 * Sprint 65 — Live-Status-Logik: Laufzeit-Zustand des Control-Center-Servers
 * eindeutig klassifizieren und Konsolenausgaben verwalten.
 *
 * Basis fuer das Live-Preview-Panel (Sprint 66-68): Server-Zustand
 * (running/building/error/stopped) wird aus messbaren Fakten abgeleitet —
 * nie geraten —, Logzeilen werden normalisiert, gebunden (Ringpuffer) und
 * für SSE/JSON-Ausgabe aufbereitet. Reine Logik, kein I/O.
 */

export type RuntimeState = "running" | "building" | "error" | "stopped";

export interface RuntimeStateInput {
  /** Prozess laeuft grundsätzlich (Server-Boot abgeschlossen). */
  processUp: boolean;
  /** Ein Build/Export laeuft aktuell (z. B. Expo-Web-Export). */
  buildActive?: boolean;
  /** Letzter Fehlerzustand als Unix-ms, falls einer bekannt ist. */
  lastErrorAtMs?: number;
  /** Letzter erfolgreicher Health-Ping als Unix-ms. */
  lastHeartbeatAtMs?: number;
  /** Letzter bekannter Health-Ping schlug fehl. */
  lastProbeFailed?: boolean;
  /**Jetzt in Unix-ms (fuer Determinismus explizit uebergeben). */
  nowMs: number;
}

export const RUNTIME_ERROR_GRACE_MS = 60_000;

/** Klassifiziert den Laufzeit-Zustand aus messbaren Fakten. */
export function classifyRuntimeState(input: RuntimeStateInput): RuntimeState {
  if (!input.processUp) return "stopped";
  if (input.buildActive) return "building";
  const hasRecentError =
    input.lastErrorAtMs !== undefined &&
    input.nowMs - input.lastErrorAtMs < RUNTIME_ERROR_GRACE_MS;
  const heartbeatFresh =
    input.lastHeartbeatAtMs !== undefined &&
    input.nowMs - input.lastHeartbeatAtMs < RUNTIME_ERROR_GRACE_MS;
  if (hasRecentError) return "error";
  if (input.lastProbeFailed && !heartbeatFresh) return "error";
  return "running";
}

export const RUNTIME_STATE_LABELS: Record<RuntimeState, string> = {
  running: "Online",
  building: "Baut",
  error: "Fehler",
  stopped: "Gestoppt",
};

/** Humanlesbares Label (UI). */
export function runtimeStateLabel(state: RuntimeState): string {
  return RUNTIME_STATE_LABELS[state];
}

export type LogLevel = "info" | "warn" | "error" | "success";

export interface RuntimeLogEntry {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  atMs: number;
}

export const MAX_RUNTIME_LOG_ENTRIES = 500;

/** Normalisiert eine rohe Logzeile (unvollstaendige/feindliche Eingaben ok). */
export function normalizeRuntimeLogEntry(
  raw: Partial<Omit<RuntimeLogEntry, "id" | "atMs">> & {
    id?: string;
    atMs?: number;
  },
  fallbackId: string,
): RuntimeLogEntry {
  const level: LogLevel = (["info", "warn", "error", "success"] as const).includes(
    raw.level as LogLevel,
  )
    ? (raw.level as LogLevel)
    : "info";
  return {
    id: String(raw.id ?? fallbackId).slice(0, 64),
    level,
    source: String(raw.source ?? "server").trim().slice(0, 64) || "server",
    message: String(raw.message ?? "").replace(/\s+$/, "").slice(0, 2000),
    atMs: Number.isFinite(raw.atMs) ? Math.floor(Number(raw.atMs)) : Date.now(),
  };
}

/** Fuegt einen Eintrag in einen gebundenen Ringpuffer ein (aeltre fallen hinten raus). */
export function pushRuntimeLog(
  buffer: RuntimeLogEntry[],
  entry: RuntimeLogEntry,
  maxEntries = MAX_RUNTIME_LOG_ENTRIES,
): RuntimeLogEntry[] {
  const bounded = Math.max(1, Math.floor(maxEntries));
  const next = [...buffer, entry];
  return next.length > bounded ? next.slice(next.length - bounded) : next;
}

/** Filtert Logzeilen (Ebene und Text) — fuer Console-Ansicht und Agent-Kontext. */
export function filterRuntimeLogs(
  buffer: RuntimeLogEntry[],
  options: { levels?: LogLevel[]; query?: string } = {},
): RuntimeLogEntry[] {
  return buffer.filter((entry) => {
    if (options.levels && !options.levels.includes(entry.level)) return false;
    if (options.query) {
      const needle = options.query.toLowerCase();
      const haystack = `${entry.source} ${entry.message}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Kompakte SSE-Zeile (data: {...}\n\n) — deterministisch serialisiert. */
export function formatLogSseEvent(entry: RuntimeLogEntry): string {
  return `data: ${JSON.stringify(entry)}\n\n`;
}

export interface LatencyClassification {
  tone: "good" | "ok" | "bad";
  label: string;
}

/** Ping-Klassifizierung fuer die Statusleiste. */
export function classifyLatency(pingMs: number | null): LatencyClassification {
  if (pingMs === null || !Number.isFinite(pingMs) || pingMs < 0) {
    return { tone: "bad", label: "—" };
  }
  if (pingMs <= 120) return { tone: "good", label: `${Math.round(pingMs)} ms` };
  if (pingMs <= 400) return { tone: "ok", label: `${Math.round(pingMs)} ms` };
  return { tone: "bad", label: `${Math.round(pingMs)} ms` };
}

export interface RuntimeStatusSnapshot {
  state: RuntimeState;
  stateLabel: string;
  activeUrl: string;
  port: number;
  connectionKind: "sse" | "poll";
  pingMs: number | null;
  logCount: number;
  serverUptimeMs: number;
  timestamp: number;
}

/** Baut den Status-Snapshot fuer /api/runtime/status (tokenfrei). */
export function buildRuntimeStatusSnapshot({
  input,
  activeUrl,
  port,
  connectionKind,
  pingMs,
  buffer,
  serverUptimeMs,
}: {
  input: RuntimeStateInput;
  activeUrl: string;
  port: number;
  connectionKind: "sse" | "poll";
  pingMs: number | null;
  buffer: RuntimeLogEntry[];
  serverUptimeMs: number;
}): RuntimeStatusSnapshot {
  const state = classifyRuntimeState(input);
  return {
    state,
    stateLabel: runtimeStateLabel(state),
    activeUrl: String(activeUrl ?? "").slice(0, 300),
    port: Number.isFinite(port) ? Math.floor(Number(port)) : 0,
    connectionKind,
    pingMs: pingMs === null ? null : Math.round(Number(pingMs)) || null,
    logCount: buffer.length,
    serverUptimeMs: Math.max(0, Math.floor(Number(serverUptimeMs) || 0)),
    timestamp: input.nowMs,
  };
}

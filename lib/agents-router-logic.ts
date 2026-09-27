/**
 * Sprint 371 — Pure Logik fuer den agents-Router (getStatus/control/getLogs).
 * Bewusst ohne Side-Effects, damit die Zuordnung Aktion -> DB-Status-Enum,
 * die Status-Aggregation und die Log-Limits isoliert testbar bleiben.
 */
import { SUPER_AGENT_STATUSES } from "./super-agents-logic";

/** Kontroll-Aktionen des agents.control-Endpunkts (stabil, kleines Vokabular). */
export const AGENT_CONTROL_ACTIONS = ["activate", "pause", "archive"] as const;
export type AgentControlAction = (typeof AGENT_CONTROL_ACTIONS)[number];

/** Mappt die API-Aktion auf den super_agent_status-Enum-Wert der DB. */
export function agentControlActionToStatus(
  action: AgentControlAction,
): (typeof SUPER_AGENT_STATUSES)[number] {
  switch (action) {
    case "activate":
      return "aktiv";
    case "pause":
      return "pausiert";
    case "archive":
      return "archiviert";
    default: {
      const exhaustive: never = action;
      throw new Error(`Unbekannte Kontroll-Aktion: ${exhaustive as string}`);
    }
  }
}

/** Serialisiert eine Superagent-Zeile fuer den Client (Datum -> ISO-String). */
export function serializeAgentRow<
  T extends { lastActiveAt: Date; createdAt: Date },
>(row: T) {
  return {
    ...row,
    lastActiveAt: row.lastActiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Aggregiert die Status-Verteilung ueber alle Agenten eines Nutzers. */
export function summarizeAgentStatuses<
  T extends { status: string; sessionId: string },
>(rows: T[]) {
  const summary = { total: rows.length, aktiv: 0, pausiert: 0, archiviert: 0 };
  for (const row of rows) {
    if (row.status === "aktiv") summary.aktiv += 1;
    else if (row.status === "pausiert") summary.pausiert += 1;
    else if (row.status === "archiviert") summary.archiviert += 1;
  }
  return summary;
}

/** Telemetrie-Sicht auf EINE Agenten-Session (Live-Abos + gepufferter Verlauf). */
export function describeAgentTelemetry(
  bufferLength: number,
  subscriberCount: number,
) {
  return {
    bufferedEvents: bufferLength,
    liveSubscribers: subscriberCount,
    live: subscriberCount > 0,
  };
}

/** Clamp fuer das Log-Limit: 1..240 (Telemetry-Bus haelt max. 240 Events). */
export const AGENT_LOGS_MAX_LIMIT = 240;

export function clampAgentLogLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) return 120;
  return Math.max(1, Math.min(AGENT_LOGS_MAX_LIMIT, Math.floor(limit)));
}

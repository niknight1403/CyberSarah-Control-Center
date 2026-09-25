import { describe, expect, it } from "vitest";
import {
  AGENT_CONTROL_ACTIONS,
  agentControlActionToStatus,
  clampAgentLogLimit,
  describeAgentTelemetry,
  serializeAgentRow,
  summarizeAgentStatuses,
  type AgentControlAction,
} from "../lib/agents-router-logic";

describe("Sprint 371 — agents-Router-Logik", () => {
  it("mappt jede Kontroll-Aktion auf den DB-Status-Enum", () => {
    expect(agentControlActionToStatus("activate")).toBe("aktiv");
    expect(agentControlActionToStatus("pause")).toBe("pausiert");
    expect(agentControlActionToStatus("archive")).toBe("archiviert");
    expect(AGENT_CONTROL_ACTIONS).toEqual(["activate", "pause", "archive"]);
  });

  it("waehlt bei ungueltiger Aktion den exhaustiven Fallback (Typsicherheit)", () => {
    expect(() => agentControlActionToStatus("loeschen" as AgentControlAction)).toThrow(/Unbekannte Kontroll-Aktion/);
  });

  it("aggregiert die Status-Verteilung ueber alle Agenten", () => {
    const rows = [
      { status: "aktiv", sessionId: "a" },
      { status: "aktiv", sessionId: "b" },
      { status: "pausiert", sessionId: "c" },
      { status: "archiviert", sessionId: "d" },
    ];
    expect(summarizeAgentStatuses(rows)).toEqual({ total: 4, aktiv: 2, pausiert: 1, archiviert: 1 });
    expect(summarizeAgentStatuses([])).toEqual({ total: 0, aktiv: 0, pausiert: 0, archiviert: 0 });
  });

  it("beschreibt die Telemetrie-Sicht einer Session ehrlich", () => {
    expect(describeAgentTelemetry(12, 0)).toEqual({ bufferedEvents: 12, liveSubscribers: 0, live: false });
    expect(describeAgentTelemetry(0, 2)).toEqual({ bufferedEvents: 0, liveSubscribers: 2, live: true });
  });

  it("serialisiert Datumsfelder zu ISO-Strings", () => {
    const row = {
      id: 7,
      status: "aktiv",
      lastActiveAt: new Date("2026-09-25T08:00:00.000Z"),
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
    };
    const out = serializeAgentRow(row);
    expect(out.lastActiveAt).toBe("2026-09-25T08:00:00.000Z");
    expect(out.createdAt).toBe("2026-09-01T09:00:00.000Z");
    expect(out.status).toBe("aktiv");
  });

  it("klemmt das Log-Limit in den ehrlichen Bereich 1..240", () => {
    expect(clampAgentLogLimit(undefined)).toBe(120);
    expect(clampAgentLogLimit(0)).toBe(1);
    expect(clampAgentLogLimit(-5)).toBe(1);
    expect(clampAgentLogLimit(7)).toBe(7);
    expect(clampAgentLogLimit(240)).toBe(240);
    expect(clampAgentLogLimit(9999)).toBe(240);
    expect(clampAgentLogLimit(120.7)).toBe(120);
  });
});

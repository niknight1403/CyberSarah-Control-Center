import { describe, expect, it } from "vitest";
import {
  SUPER_AGENT_COLORS,
  defaultSeedSuperAgent,
  generateSuperAgentSessionId,
  nextSuperAgentColor,
  normalizeSuperAgentInput,
  normalizeSuperAgentPatch,
  sortSuperAgentsByActivity,
} from "../lib/super-agents-logic";

const baseAgent = {
  id: 1,
  name: "Elara",
  purpose: "Allgemein",
  color: "#FFB000",
  sessionId: "default",
  status: "aktiv" as const,
  isDefault: true,
  lastActiveAt: "2026-09-16T10:00:00.000Z",
  createdAt: "2026-09-16T10:00:00.000Z",
};

describe("Sprint 137 — super-agents-logic", () => {
  it("normalisiert Name, Aufgabe und Farbe", () => {
    expect(normalizeSuperAgentInput({ name: "  Nova  ", purpose: "  Support  ", color: "#00F2FE" })).toEqual({
      name: "Nova",
      purpose: "Support",
      color: "#00F2FE",
    });
  });

  it("lehnt leeren Namen ab und faellt bei ungueltiger Farbe auf den Standard zurueck", () => {
    expect(() => normalizeSuperAgentInput({ name: "   " })).toThrow();
    expect(normalizeSuperAgentInput({ name: "Nova", color: "keine-farbe" }).color).toBe(SUPER_AGENT_COLORS[0]);
  });

  it("Patch bleibt partiell, leere Namen und ungueltige Status werden abgelehnt", () => {
    expect(normalizeSuperAgentPatch({ purpose: "Neu" })).toEqual({ purpose: "Neu" });
    expect(() => normalizeSuperAgentPatch({ name: "" })).toThrow();
    expect(() => normalizeSuperAgentPatch({ status: "x" as never })).toThrow();
  });

  it("seedet den Standard-Agenten auf der Default-Session (bestehende Verlaeufe bleiben erhalten)", () => {
    const seed = defaultSeedSuperAgent();
    expect(seed.sessionId).toBe("default");
    expect(seed.isDefault).toBe(true);
    expect(seed.name.length).toBeGreaterThan(0);
  });

  it("sortiert zuletzt aktive Agenten zuerst, archivierte ans Ende", () => {
    const agents = [
      { ...baseAgent, id: 1, lastActiveAt: "2026-09-16T10:00:00.000Z" },
      { ...baseAgent, id: 2, isDefault: false, sessionId: "agent-b", lastActiveAt: "2026-09-16T12:00:00.000Z" },
      { ...baseAgent, id: 3, isDefault: false, sessionId: "agent-c", status: "archiviert" as const, lastActiveAt: "2026-09-16T11:00:00.000Z" },
    ];
    expect(sortSuperAgentsByActivity(agents).map((agent) => agent.id)).toEqual([2, 1, 3]);
  });

  it("vergaibt Farben zyklisch und erzeugt gueltige Session-IDs", () => {
    expect(nextSuperAgentColor(1)).toBe(SUPER_AGENT_COLORS[1]);
    expect(nextSuperAgentColor(SUPER_AGENT_COLORS.length)).toBe(SUPER_AGENT_COLORS[0]);
    expect(generateSuperAgentSessionId("abc-123")).toBe("agent-abc-123");
  });
});

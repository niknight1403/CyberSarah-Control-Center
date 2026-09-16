import { describe, expect, it } from "vitest";
import {
  buildFindingsFromSnapshot,
  buildOptimizerAnalysisPrompt,
  estimateNextCycleAt,
  pickObjective,
  shouldRunCycle,
  sortFindingsBySeverity,
  type OptimizerSnapshot,
} from "@/lib/optimizer-logic";

function snapshot(overrides: Partial<OptimizerSnapshot> = {}): OptimizerSnapshot {
  return {
    collectedAt: "2026-09-16T10:00:00.000Z",
    dbHealthy: true,
    runtimeErrors: 0,
    runtimeWarnings: 0,
    errorSamples: [],
    uptimeMinutes: 120,
    lastCycles: [],
    ...overrides,
  };
}

describe("optimizer-logic: Cadence", () => {
  const bootedAtMs = Date.parse("2026-09-16T08:00:00Z");
  const nowMs = bootedAtMs + 60 * 60 * 1000; // 1h nach Boot

  it("startet nicht, wenn bereits ein Zyklus laeuft", () => {
    expect(shouldRunCycle({ running: true, lastCycleAtMs: null, nowMs, bootedAtMs, intervalMinutes: 360 })).toBe(false);
  });

  it("startet nicht in der Boot-Phase (erste 5 Minuten)", () => {
    expect(
      shouldRunCycle({ running: false, lastCycleAtMs: null, nowMs: bootedAtMs + 60_000, bootedAtMs, intervalMinutes: 360 }),
    ).toBe(false);
  });

  it("startet den ersten Zyklus nach Boot-Phase", () => {
    expect(
      shouldRunCycle({ running: false, lastCycleAtMs: null, nowMs: bootedAtMs + 6 * 60_000, bootedAtMs, intervalMinutes: 360 }),
    ).toBe(true);
  });

  it("haelt das Intervall ein", () => {
    const lastCycleAtMs = bootedAtMs + 6 * 60 * 1000;
    const intervalMinutes = 360;
    expect(
      shouldRunCycle({ running: false, lastCycleAtMs, nowMs: lastCycleAtMs + (intervalMinutes - 1) * 60_000, bootedAtMs, intervalMinutes }),
    ).toBe(false);
    expect(
      shouldRunCycle({ running: false, lastCycleAtMs, nowMs: lastCycleAtMs + intervalMinutes * 60_000, bootedAtMs, intervalMinutes }),
    ).toBe(true);
  });

  it("schaetzt den naechsten Lauf (null waehrend ein Zyklus laeuft)", () => {
    expect(estimateNextCycleAt({ running: true, lastCycleAtMs: null, nowMs, bootedAtMs, intervalMinutes: 360 })).toBeNull();
    const next = estimateNextCycleAt({ running: false, lastCycleAtMs: nowMs, nowMs, bootedAtMs, intervalMinutes: 60 });
    expect(next).toBe(new Date(nowMs + 60 * 60_000).toISOString());
  });
});

describe("optimizer-logic: Findings", () => {
  it("DB-Ausfall ist Top-Prioritaet", () => {
    const findings = buildFindingsFromSnapshot(snapshot({ dbHealthy: false, runtimeErrors: 5, runtimeWarnings: 20 }));
    expect(findings[0].key).toBe("db_down");
    expect(findings[0].severity).toBe("error");
  });

  it("viele Fehler eskalieren zu error", () => {
    const findings = buildFindingsFromSnapshot(snapshot({ runtimeErrors: 25 }));
    expect(findings.find((f) => f.key === "runtime_errors")?.severity).toBe("error");
  });

  it("wenige Fehler bleiben warning", () => {
    const findings = buildFindingsFromSnapshot(snapshot({ runtimeErrors: 3 }));
    expect(findings.find((f) => f.key === "runtime_errors")?.severity).toBe("warning");
  });

  it("gesundes System erzeugt ehrliches healthy-Finding", () => {
    const findings = buildFindingsFromSnapshot(snapshot());
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("healthy");
    expect(findings[0].severity).toBe("info");
  });

  it("fehlgeschlagene Vorgaenger-Zyklen werden zum Backlog-Finding", () => {
    const findings = buildFindingsFromSnapshot(
      snapshot({ lastCycles: [{ status: "escalated", finishedAt: "x", title: "Auto-Optimierungszyklus" }] }),
    );
    expect(findings.find((f) => f.key === "optimizer_backlog")).toBeTruthy();
  });

  it("sortiert error vor warning vor info", () => {
    const sorted = sortFindingsBySeverity([
      { key: "info1", severity: "info", detail: "" },
      { key: "err1", severity: "error", detail: "" },
      { key: "warn1", severity: "warning", detail: "" },
    ]);
    expect(sorted.map((f) => f.key)).toEqual(["err1", "warn1", "info1"]);
  });
});

describe("optimizer-logic: Prompt & Zielauswahl", () => {
  it("Prompt enthaelt Snapshots und Findings", () => {
    const snap = snapshot({ dbHealthy: false, errorSamples: ["TypeError: x is not a function"] });
    const findings = buildFindingsFromSnapshot(snap);
    const prompt = buildOptimizerAnalysisPrompt(snap, findings);
    expect(prompt).toContain("Datenbank erreichbar: NEIN");
    expect(prompt).toContain("[ERROR] db_down");
    expect(prompt).toContain("TypeError: x is not a function");
  });

  it("pickObjective waehlt hoechstes Impact", () => {
    const recs = [
      { title: "Kleinkram", impact: "gering", objective: "Unwichtige Kosmetik durchfuehren." },
      { title: "DB-Verbindung haerten", impact: "hoch", objective: "Analysiere die Datenbankverbindung und haerte sie gegen Timeouts." },
      { title: "Caching", impact: "mittel", objective: "Fuege Caching fuer haeufige Queries hinzu." },
    ];
    expect(pickObjective(recs)?.title).toBe("DB-Verbindung haerten");
  });

  it("pickObjective faellt auf mittel zurueck und ignoriert unbrauchbares", () => {
    expect(pickObjective([{ title: "x", impact: "mittel", objective: "Mittlerer Impact Task der ausgefuehrt werden soll." }])?.title).toBe("x");
    expect(pickObjective([{ title: "x", impact: "hoch", objective: "zu kurz" }])).toBeNull();
    expect(pickObjective([])).toBeNull();
    expect(pickObjective([{ title: 5, impact: "hoch", objective: 42 }])).toBeNull();
  });
});

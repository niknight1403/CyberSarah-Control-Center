import { describe, it, expect } from "vitest";
import {
  nextRunAt,
  dueWorkflows,
  setWorkflowActive,
  validateTrigger,
  describeSchedule,
} from "@/lib/agent-workflow-scheduler-logic";
import type { AgentWorkflow } from "@/lib/agent-workflow-scheduler-logic";

const wf = (over: Partial<AgentWorkflow> = {}): AgentWorkflow => ({
  id: "w1",
  name: "Tagescheck",
  trigger: { kind: "cron", expression: "0 9 * * *", hourUTC: 9, minute: 0 },
  active: true,
  lastRunMs: null,
  ...over,
});

describe("Paritaet 2/6 — Workflow-Scheduler", () => {
  it("cron: vor 9 UTC heute, verpasst bleibt faellig, gelaufen morgen", () => {
    const before9 = Date.UTC(2026, 8, 25, 8, 0);
    expect(nextRunAt(wf(), before9)).toBe(Date.UTC(2026, 8, 25, 9, 0));
    // Slot verpasst, noch nie gelaufen -> verspaetet faellig, NICHT still morgen.
    expect(nextRunAt(wf(), Date.UTC(2026, 8, 25, 10, 0))).toBe(Date.UTC(2026, 8, 25, 9, 0));
    // Heute (spaet) schon gelaufen -> morgen.
    const ranLate = wf({ lastRunMs: Date.UTC(2026, 8, 25, 10, 0) });
    expect(nextRunAt(ranLate, Date.UTC(2026, 8, 25, 10, 0))).toBe(Date.UTC(2026, 8, 26, 9, 0));
  });

  it("pausierte Workflows laufen NIE heimlich", () => {
    const paused = setWorkflowActive(wf(), false);
    expect(paused.active).toBe(false);
    expect(nextRunAt(paused, 0)).toBeNull();
    expect(dueWorkflows([paused], Date.UTC(2026, 8, 25, 9, 0))).toHaveLength(0);
  });

  it("Intervall: vom letzten Lauf getaktet, Einmal: abgelaufen nie wieder", () => {
    const interval = wf({ trigger: { kind: "interval", everyMinutes: 1 } });
    expect(nextRunAt(interval, 100_000)).toBe(120_000);
    const once = wf({ trigger: { kind: "once", atMs: 5_000 } });
    expect(nextRunAt(once, 1_000)).toBe(5_000);
    expect(nextRunAt(once, 6_000)).toBeNull();
    const entity = wf({ trigger: { kind: "entity", entity: "Task", on: "created" } });
    expect(nextRunAt(entity, 0)).toBeNull(); // Event-getriggert, nicht zeitgetaktet
  });

  it("faellige Workflows werden ehrlich gezaehlt", () => {
    const at9 = Date.UTC(2026, 8, 25, 9, 0);
    expect(dueWorkflows([wf({ lastRunMs: Date.UTC(2026, 8, 24, 9, 0) })], at9)).toHaveLength(1);
    expect(dueWorkflows([wf({ lastRunMs: at9 })], at9)).toHaveLength(0); // Slot exakt gelaufen
  });

  it("Trigger-Validierung und Uebersicht benennen Fehler", () => {
    expect(validateTrigger({ kind: "interval", everyMinutes: 0 }).join()).toContain("muss > 0");
    expect(validateTrigger({ kind: "cron", expression: "", hourUTC: 25, minute: 0 })).toHaveLength(2);
    expect(validateTrigger({ kind: "entity", entity: " ", on: "created" }).join()).toContain("Entity-Name fehlt");
    const text = describeSchedule([wf(), setWorkflowActive(wf(), false)], Date.UTC(2026, 8, 25, 8, 30));
    expect(text).toContain("aktiv");
    expect(text).toContain("PAUSIERT (laeuft nicht)");
  });
});

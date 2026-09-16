import { describe, expect, it } from "vitest";

import {
  coerceLedgerTask,
  normalizeStepStatus,
  normalizeTaskStatus,
} from "@/lib/task-ledger-logic";

/**
 * Regressionstests fuer den Workflows-Tab-White-Screen (Sprint 133):
 * `orchestrator.tasks` lieferte nur Index-Einträge OHNE steps und
 * correctionIterations — der Tab las aber `task.steps.length` und
 * crashte mit einem weissen Bildschirm, sobald ein Task existierte.
 */

describe("normalizeTaskStatus", () => {
  it("laesst bekannte Status unverändert durch", () => {
    expect(normalizeTaskStatus("pending")).toBe("pending");
    expect(normalizeTaskStatus("running")).toBe("running");
    expect(normalizeTaskStatus("success")).toBe("success");
    expect(normalizeTaskStatus("failed")).toBe("failed");
    expect(normalizeTaskStatus("escalated")).toBe("escalated");
  });

  it("mappt unbekannte/feindliche Werte auf 'pending'", () => {
    expect(normalizeTaskStatus("cancelled")).toBe("pending");
    expect(normalizeTaskStatus("")).toBe("pending");
    expect(normalizeTaskStatus(null)).toBe("pending");
    expect(normalizeTaskStatus(undefined)).toBe("pending");
    expect(normalizeTaskStatus(42)).toBe("pending");
    expect(normalizeTaskStatus({ boese: true })).toBe("pending");
  });
});

describe("normalizeStepStatus", () => {
  it("laesst bekannte Status durch, alles andere wird 'pending'", () => {
    expect(normalizeStepStatus("success")).toBe("success");
    expect(normalizeStepStatus("aborted")).toBe("pending");
    expect(normalizeStepStatus(undefined)).toBe("pending");
  });
});

describe("coerceLedgerTask", () => {
  it("Der Fall, der den White-Screen verursacht hat: Index-Eintrag ohne steps", () => {
    const indexEntry = {
      id: "task-1",
      title: "Systemstatus pruefen",
      status: "success",
      createdAt: "2026-09-16T07:00:00.000Z",
      updatedAt: "2026-09-16T07:05:00.000Z",
      // absichtlich KEINE steps / correctionIterations
    };
    const task = coerceLedgerTask(indexEntry);
    expect(Array.isArray(task.steps)).toBe(true);
    expect(task.steps).toHaveLength(0);
    expect(task.correctionIterations).toBe(0);
    expect(task.objective).toBe("");
    expect(task.status).toBe("success");
    // Der Zugriffs-Muster, das vorher crashte, ist jetzt immer sicher:
    expect(task.steps.length).toBe(0);
    expect(task.correctionIterations > 0).toBe(false);
  });

  it("volle Records bleiben vollstaendig erhalten", () => {
    const full = {
      id: "task-2",
      title: "Deploy pruefen",
      objective: "Pruefe den Produktiv-Deploy",
      status: "failed",
      correctionIterations: 2,
      finalAnswer: { ok: false },
      createdAt: "2026-09-16T08:00:00.000Z",
      updatedAt: "2026-09-16T08:10:00.000Z",
      steps: [
        { id: "s1", name: "Render-API", status: "success", attempts: 1, logs: ["ok"] },
        { id: "s2", name: "Deploy-Check", status: "failed", attempts: 3, error: "503", logs: ["retry", "503"] },
      ],
    };
    const task = coerceLedgerTask(full);
    expect(task.steps).toHaveLength(2);
    expect(task.steps[1].error).toBe("503");
    expect(task.steps[1].logs).toEqual(["retry", "503"]);
    expect(task.correctionIterations).toBe(2);
    expect(task.finalAnswer).toEqual({ ok: false });
  });

  it("kaputte/fremde Schritt-Objekte werden render-sicher gemacht", () => {
    const task = coerceLedgerTask({
      id: "task-3",
      status: "unknown-status",
      steps: [null, { name: 5 }, { id: "s", name: "ok", status: "running", attempts: "viele", logs: ["x", 7] }],
    });
    expect(task.status).toBe("pending");
    expect(task.steps).toHaveLength(3);
    expect(task.steps[1].name).toBe("Unbenannter Schritt");
    expect(task.steps[1].attempts).toBe(1);
    expect(task.steps[2].logs).toEqual(["x"]);
  });

  it("null/undefined/leere Objekte ergeben einen harmlosen Platzhalter-Task", () => {
    for (const raw of [null, undefined, {}, "string", 123]) {
      const task = coerceLedgerTask(raw);
      expect(Array.isArray(task.steps)).toBe(true);
      expect(task.title).toBe("Autonome Aufgabe");
      expect(task.status).toBe("pending");
    }
  });
});

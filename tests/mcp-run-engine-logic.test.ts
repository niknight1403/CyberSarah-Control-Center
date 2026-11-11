/**
 * Sprint 8 — Tests der Run-Engine.
 *
 * Zusagen: Limits brechen hart ab, Fehlschlaege gelten nie als Erfolg,
 * freigabepflichtige Aufgaben halten den Lauf an, und jeder Schritt kostet
 * sichtbar Budget und Schritte.
 */
import { describe, expect, it } from "vitest";

import {
  abortRun,
  applyStep,
  approveTask,
  canExecute,
  createRunState,
  finalizeRun,
  nextTask,
  remainingBudget,
  startRun,
  summarizeRun,
  type RunState,
} from "../lib/mcp-run-engine-logic";
import type { TeamPlan, TeamTask } from "../lib/mcp-team-orchestration-logic";

function task(overrides: Partial<TeamTask> & { id: string }): TeamTask {
  return {
    title: overrides.id,
    goal: overrides.id,
    assignee: "research-scout",
    dependsOn: [],
    matches: [],
    estimatedSteps: 2,
    estimatedCostCents: 30,
    riskLevel: "low",
    requiresApproval: false,
    ...overrides,
  };
}

const PLAN: TeamPlan = {
  objective: "Recherchiere den Markt und pruefe die Zahlen.",
  tasks: [
    task({ id: "scope" }),
    task({ id: "research", dependsOn: ["scope"] }),
    task({ id: "produce", dependsOn: ["research"], assignee: "content-writer" }),
  ],
  order: ["scope", "research", "produce"],
  totalSteps: 6,
  totalCostCents: 90,
  budgetCents: 100,
  warnings: [],
  unassigned: [],
};

function fresh(overrides: Partial<Parameters<typeof createRunState>[0]> = {}): RunState {
  return createRunState({
    plan: PLAN,
    limits: { budgetCents: 100, maxSteps: 10, maxDurationMs: 60_000, maxAttemptsPerTask: 2 },
    nowMs: 1000,
    ...overrides,
  });
}

function complete(state: RunState, taskId: string, cost = 10): RunState {
  return applyStep(state, { taskId, outcome: "success", costCents: cost, durationMs: 100, nowMs: 2000 });
}

describe("Start und Reihenfolge", () => {
  it("initialisiert alle Aufgaben als offen", () => {
    const state = fresh();
    expect(state.status).toBe("pending");
    expect(Object.keys(state.tasks)).toEqual(["scope", "research", "produce"]);
    expect(Object.values(state.tasks).every((entry) => entry.status === "pending")).toBe(true);
  });

  it("startet genau einmal", () => {
    const started = startRun(fresh(), 1500);
    expect(started.status).toBe("running");
    expect(started.startedAtMs).toBe(1500);
    expect(startRun(started, 3000).startedAtMs).toBe(1500);
  });

  it("liefert die erste ausfuehrbare Aufgabe", () => {
    const result = nextTask(startRun(fresh(), 1500));
    expect(result.kind).toBe("runnable");
    if (result.kind !== "runnable") return;
    expect(result.task.id).toBe("scope");
  });

  it("wartet auf Vorgaenger", () => {
    let state = startRun(fresh(), 1500);
    state = complete(state, "scope");
    const result = nextTask(state);
    expect(result.kind).toBe("runnable");
    if (result.kind !== "runnable") return;
    expect(result.task.id).toBe("research");
  });

  it("meldet fehlende Agenten als Warten statt Ausfuehren", () => {
    const plan = { ...PLAN, tasks: [task({ id: "x", assignee: null })], order: ["x"] };
    const state = createRunState({ plan, limits: fresh().limits, nowMs: 1000 });
    expect(nextTask(state).kind).toBe("waiting");
  });

  it("verlangt Freigabe fuer freigabepflichtige Aufgaben", () => {
    const plan = { ...PLAN, tasks: [task({ id: "pay", requiresApproval: true, riskLevel: "high" as const })], order: ["pay"] };
    const state = createRunState({ plan, limits: fresh().limits, nowMs: 1000 });
    expect(nextTask(state).kind).toBe("needs_approval");
  });

  it("meldet Abschluss, wenn alles erledigt ist", () => {
    let state = startRun(fresh(), 1500);
    state = complete(state, "scope");
    state = complete(state, "research");
    state = complete(state, "produce");
    expect(nextTask(state).kind).toBe("done");
  });
});

describe("Schritte verbuchen", () => {
  it("zaehlt Schritte und Kosten sichtbar", () => {
    const state = complete(startRun(fresh(), 1500), "scope", 25);
    expect(state.stepsUsed).toBe(1);
    expect(state.spentCents).toBe(25);
    expect(state.tasks.scope.status).toBe("done");
    expect(state.steps[0]).toMatchObject({ taskId: "scope", outcome: "success", costCents: 25, step: 1 });
  });

  it("ignoriert negative Kosten", () => {
    const state = applyStep(startRun(fresh(), 1500), { taskId: "scope", outcome: "success", costCents: -50, durationMs: -10, nowMs: 2000 });
    expect(state.spentCents).toBe(0);
    expect(state.steps[0].durationMs).toBe(0);
  });

  it("wiederholt Fehlschlaege bis zum Limit, dann fehlgeschlagen", () => {
    let state = startRun(fresh(), 1500);
    state = applyStep(state, { taskId: "scope", outcome: "failed", costCents: 5, durationMs: 10, note: "Timeout", nowMs: 2000 });
    expect(state.tasks.scope.status).toBe("pending");
    expect(state.tasks.scope.attempts).toBe(1);
    state = applyStep(state, { taskId: "scope", outcome: "failed", costCents: 5, durationMs: 10, note: "Timeout", nowMs: 2100 });
    expect(state.tasks.scope.status).toBe("failed");
    expect(state.status).toBe("failed");
    expect(nextTask(state).kind).toBe("waiting");
  });

  it("haelt bei Freigabebedarf an und laeuft nach Freigabe weiter", () => {
    let state = startRun(fresh(), 1500);
    state = applyStep(state, { taskId: "scope", outcome: "approval_required", costCents: 2, durationMs: 5, nowMs: 2000 });
    expect(state.status).toBe("paused");
    expect(state.approvals).toEqual(["scope"]);
    const approved = approveTask(state, "scope");
    expect(approved.status).toBe("running");
    expect(approved.approved).toContain("scope");
    expect(approved.approvals).toEqual([]);
  });

  it("bricht bei Budgetueberschreitung ab und markiert offene Aufgaben", () => {
    let state = startRun(fresh(), 1500);
    state = applyStep(state, { taskId: "scope", outcome: "success", costCents: 120, durationMs: 100, nowMs: 2000 });
    expect(state.status).toBe("aborted");
    expect(state.abortReason).toContain("Budget erschoepft");
    expect(state.finishedAtMs).toBe(2000);
    expect(state.tasks.research.status).toBe("skipped");
  });

  it("bricht beim Schrittlimit ab", () => {
    const state0 = createRunState({
      plan: PLAN,
      limits: { budgetCents: 1000, maxSteps: 1, maxDurationMs: 60_000, maxAttemptsPerTask: 3 },
      nowMs: 1000,
    });
    const state = applyStep(startRun(state0, 1200), { taskId: "scope", outcome: "success", costCents: 5, durationMs: 5, nowMs: 2000 });
    expect(state.status).toBe("aborted");
    expect(state.abortReason).toContain("Schrittlimit");
  });
});

describe("Abschluss", () => {
  it("schliesst ab, wenn alles erledigt ist", () => {
    let state = startRun(fresh(), 1500);
    state = complete(state, "scope");
    state = complete(state, "research");
    state = complete(state, "produce");
    const done = finalizeRun(state, 5000);
    expect(done.status).toBe("completed");
    expect(done.finishedAtMs).toBe(5000);
  });

  it("bleibt pausiert, solange offene Freigaben existieren", () => {
    let state = startRun(fresh(), 1500);
    state = applyStep(state, { taskId: "scope", outcome: "approval_required", costCents: 1, durationMs: 1, nowMs: 2000 });
    state = complete(state, "research");
    state = complete(state, "produce");
    expect(finalizeRun(state, 5000).status).toBe("paused");
  });

  it("meldet fehlgeschlagene Laeufe mit Grund", () => {
    let state = startRun(fresh(), 1500);
    state = applyStep(state, { taskId: "scope", outcome: "failed", costCents: 1, durationMs: 1, nowMs: 2000 });
    state = applyStep(state, { taskId: "scope", outcome: "failed", costCents: 1, durationMs: 1, nowMs: 2100 });
    const failed = finalizeRun(state, 5000);
    expect(failed.status).toBe("failed");
    expect(failed.abortReason).toContain("scope");
  });

  it("bricht auf Anforderung ab", () => {
    const state = abortRun(startRun(fresh(), 1500), "Vom Administrator gestoppt", 4000);
    expect(state.status).toBe("aborted");
    expect(state.abortReason).toBe("Vom Administrator gestoppt");
    expect(Object.values(state.tasks).every((entry) => entry.status === "skipped")).toBe(true);
  });
});

describe("Zusammenfassung und Startpflicht", () => {
  it("fasst den Lauf ehrlich zusammen", () => {
    const state = complete(startRun(fresh(), 1500), "scope", 20);
    const summary = summarizeRun(state);
    expect(summary.done).toBe(1);
    expect(summary.open).toBe(2);
    expect(summary.spentCents).toBe(20);
    expect(summary.summary).toContain("laeuft");
  });

  it("nennt den Abbruchgrund in der Zusammenfassung", () => {
    const state = abortRun(startRun(fresh(), 1500), "Budget weg", 3000);
    expect(summarizeRun(state).summary).toContain("Budget weg");
  });

  it("verweigert Schritte nach Laufende und ohne Freigabe", () => {
    const ended = abortRun(startRun(fresh(), 1500), "Stopp", 3000);
    expect(canExecute(ended, PLAN.tasks[0]).ok).toBe(false);
    const needsApproval = { ...PLAN.tasks[0], requiresApproval: true };
    expect(canExecute(fresh(), needsApproval).ok).toBe(false);
    expect(canExecute(fresh(), { ...PLAN.tasks[0], assignee: null }).ok).toBe(false);
    expect(canExecute(fresh(), PLAN.tasks[0]).ok).toBe(true);
  });

  it("verweigert Schritte bei erschoepftem Budget", () => {
    const state = { ...startRun(fresh(), 1500), spentCents: 100 };
    const result = canExecute(state, PLAN.tasks[0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Budget");
  });

  it("berechnet das Restbudget", () => {
    const state = complete(startRun(fresh(), 1500), "scope", 30);
    expect(remainingBudget(state)).toBe(70);
  });
});

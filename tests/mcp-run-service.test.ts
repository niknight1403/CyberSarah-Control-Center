/**
 * Sprint 8 — Tests des Run-Service.
 *
 * Zusagen: ohne Executor wird kein Erfolg vorgetaeuscht, nicht wiederholbare
 * Fehler beenden den Lauf, Freigaben halten an, und Limits brechen ab.
 */
import { describe, expect, it } from "vitest";

import { createMcpRunService } from "../server/mcp-run-service";
import type { McpRunStore, StoredRun } from "../server/mcp-run-store";
import type { McpTeamPlanStore, StoredTeamPlan } from "../server/mcp-team-store";
import type { TaskExecutor } from "../lib/mcp-run-engine-logic";
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

function plan(overrides: Partial<TeamPlan> = {}): TeamPlan {
  return {
    objective: "Recherchiere den Markt und pruefe die Zahlen.",
    tasks: [task({ id: "scope" }), task({ id: "research", dependsOn: ["scope"] })],
    order: ["scope", "research"],
    totalSteps: 4,
    totalCostCents: 60,
    budgetCents: 100,
    warnings: [],
    unassigned: [],
    ...overrides,
  };
}

function build(options: { plan?: TeamPlan | null; execute?: TaskExecutor; budgetCents?: number } = {}) {
  const planRow: StoredTeamPlan = {
    id: 7,
    objective: "Ziel",
    plan: options.plan === null ? plan() : options.plan ?? plan(),
    allocations: {},
    budgetCents: 100,
    taskCount: 2,
    openCount: 0,
    status: "planned",
    createdBy: null,
    createdAt: new Date(0),
  };
  const plans: McpTeamPlanStore = {
    async list() {
      return [planRow];
    },
    async get(id) {
      return options.plan === null || id !== 7 ? null : planRow;
    },
    async insert() {
      throw new Error("nicht benoetigt");
    },
    async setStatus() {
      return true;
    },
  };

  const runs = new Map<number, StoredRun>();
  let id = 1;
  const runStore: McpRunStore = {
    async list(limit = 20) {
      return [...runs.values()].slice(0, limit);
    },
    async get(runId) {
      return runs.get(runId) ?? null;
    },
    async create(input) {
      const row: StoredRun = {
        id: id++,
        planId: input.planId,
        status: input.state.status,
        state: input.state,
        spentCents: input.state.spentCents,
        stepsUsed: input.state.stepsUsed,
        abortReason: input.state.abortReason,
        startedAt: new Date(input.state.startedAtMs),
        finishedAt: null,
        createdBy: input.actor,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      runs.set(row.id, row);
      return row;
    },
    async save(runId, state) {
      const existing = runs.get(runId);
      if (!existing) return null;
      const row: StoredRun = { ...existing, state, status: state.status, spentCents: state.spentCents, stepsUsed: state.stepsUsed, abortReason: state.abortReason };
      runs.set(runId, row);
      return row;
    },
  };

  let clock = 1000;
  const service = createMcpRunService({
    plans,
    runs: runStore,
    execute: options.execute,
    now: () => (clock += 100),
  });
  return { service, runs, planRow };
}

const successExecutor: TaskExecutor = async () => ({ ok: true, costCents: 10, durationMs: 50, note: "ok" });

describe("Lauf starten", () => {
  it("legt einen Lauf fuer einen bestehenden Plan an", async () => {
    const { service } = build();
    const started = await service.start({ planId: 7, actor: "admin" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.status).toBe("running");
    expect(started.run.createdBy).toBe("admin");
    expect(started.run.planId).toBe(7);
  });

  it("lehnt unbekannte Plaene und unbrauchbare Budgets ab", async () => {
    const { service } = build();
    const missing = await service.start({ planId: 99 });
    expect(missing.ok).toBe(false);
    const zeroBudget = await service.start({ planId: 7, budgetCents: 0 });
    expect(zeroBudget.ok).toBe(false);
  });
});

describe("Schritte", () => {
  it("fuehrt einen Schritt aus und verbucht Kosten", async () => {
    const { service } = build({ execute: successExecutor });
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const step = await service.step(started.run.id);
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.state.stepsUsed).toBe(1);
    expect(step.state.spentCents).toBe(10);
    expect(step.state.tasks.scope.status).toBe("done");
  });

  it("taeuscht ohne Executor keinen Erfolg vor", async () => {
    const { service } = build();
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const step = await service.step(started.run.id);
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.state.status).toBe("failed");
    expect(step.state.abortReason).toContain("execution_disabled");
    expect(step.state.tasks.scope.status).toBe("failed");
    expect(step.state.stepsUsed).toBe(1);
  });

  it("wiederholt wiederholbare Fehler und scheitert danach", async () => {
    const failing: TaskExecutor = async () => ({ ok: false, costCents: 5, durationMs: 10, retryable: true, note: "Timeout" });
    const { service } = build({ execute: failing });
    const started = await service.start({ planId: 7, limits: { maxAttemptsPerTask: 2 } });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const first = await service.step(started.run.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.tasks.scope.attempts).toBe(1);
    const second = await service.step(started.run.id);
    if (!second.ok) return;
    expect(second.state.tasks.scope.status).toBe("failed");
    expect(second.state.status).toBe("failed");
  });

  it("bricht bei Budgetueberschreitung ab", async () => {
    const expensive: TaskExecutor = async () => ({ ok: true, costCents: 150, durationMs: 10 });
    const { service } = build({ execute: expensive });
    const started = await service.start({ planId: 7, budgetCents: 100 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const step = await service.step(started.run.id);
    if (!step.ok) return;
    expect(step.state.status).toBe("aborted");
    expect(step.state.abortReason).toContain("Budget erschoepft");
  });

  it("fuehrt mit advance bis zum Abschluss", async () => {
    const { service } = build({ execute: successExecutor });
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const advanced = await service.advance(started.run.id, 10);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    expect(advanced.state.status).toBe("completed");
    expect(advanced.state.stepsUsed).toBe(2);
  });
});

describe("Freigaben und Abbruch", () => {
  it("haelt bei freigabepflichtiger Aufgabe an und laeuft nach Freigabe", async () => {
    const riskyPlan = plan({
      tasks: [task({ id: "pay", requiresApproval: true, riskLevel: "high" })],
      order: ["pay"],
    });
    const { service } = build({ plan: riskyPlan, execute: successExecutor });
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const paused = await service.step(started.run.id);
    if (!paused.ok) return;
    expect(paused.state.status).toBe("paused");
    expect(paused.state.approvals).toContain("pay");

    const approved = await service.approve(started.run.id, "pay");
    if (!approved.ok) return;
    expect(approved.state.status).toBe("running");

    const executed = await service.step(started.run.id);
    if (!executed.ok) return;
    expect(executed.state.tasks.pay.status).toBe("done");
  });

  it("lehnt Freigaben fuer fremde Aufgaben ab", async () => {
    const { service } = build();
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const result = await service.approve(started.run.id, "gibtsnicht");
    expect(result.ok).toBe(false);
  });

  it("bricht auf Anforderung ab und ignoriert spaetere Schritte", async () => {
    const { service } = build({ execute: successExecutor });
    const started = await service.start({ planId: 7 });
    if (!started.ok) throw new Error("Start fehlgeschlagen");
    const aborted = await service.abort(started.run.id, "Manueller Stopp");
    if (!aborted.ok) return;
    expect(aborted.state.status).toBe("aborted");
    const after = await service.step(started.run.id);
    if (!after.ok) return;
    expect(after.action).toBe("completed");
    expect(after.state.stepsUsed).toBe(0);
  });
});

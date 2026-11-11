/**
 * Sprint 8 — Run-Service: Plan ausfuehren, Schritt fuer Schritt.
 *
 * Der Service besitzt den Loop, die Engine die Regeln. Ausgefuehrt wird
 * ausschliesslich ueber einen injizierten `TaskExecutor`; ohne echten
 * Executor schlaegt jeder Schritt ehrlich mit `execution_disabled` fehl,
 * statt Erfolg vorzutaeuschen.
 */
import {
  abortRun,
  applyStep,
  approveTask,
  canExecute,
  createRunState,
  finalizeRun,
  nextTask,
  startRun,
  summarizeRun,
  type RunLimitsConfig,
  type RunState,
  type TaskExecutor,
} from "../lib/mcp-run-engine-logic";
import type { TeamPlan } from "../lib/mcp-team-orchestration-logic";
import type { McpRunStore, StoredRun } from "./mcp-run-store";
import type { McpTeamPlanStore } from "./mcp-team-store";

export const DEFAULT_RUN_LIMITS: Omit<RunLimitsConfig, "budgetCents"> = {
  maxSteps: 40,
  maxDurationMs: 10 * 60_000,
  maxAttemptsPerTask: 2,
};

/**
 * Standard-Executor: verweigert echte Werkzeugaufrufe. Das ist Absicht —
 * Live-Aufrufe brauchen Freigabe- und Audit-Pfad (Sprint 9) und werden nicht
 * stillschweigend aktiviert.
 */
export const refusingExecutor: TaskExecutor = async ({ task }) => ({
  ok: false,
  costCents: 0,
  durationMs: 0,
  retryable: false,
  code: "execution_disabled",
  note: `Ausfuehrung fuer "${task.id}" ist deaktiviert: es ist kein Werkzeug-Executor verdrahtet.`,
});

export type RunServiceDeps = {
  plans: McpTeamPlanStore;
  runs: McpRunStore;
  execute?: TaskExecutor;
  now?: () => number;
};

export type StepResult =
  | { ok: true; run: StoredRun; state: RunState; action: "executed" | "paused" | "waiting" | "completed"; detail: string }
  | { ok: false; reason: string };

export type RunService = {
  start(input: { planId: number; budgetCents?: number; limits?: Partial<RunLimitsConfig>; actor?: string | null }): Promise<StepResult>;
  step(runId: number): Promise<StepResult>;
  advance(runId: number, maxIterations?: number): Promise<StepResult>;
  approve(runId: number, taskId: string): Promise<StepResult>;
  abort(runId: number, reason: string): Promise<StepResult>;
  get(runId: number): Promise<StoredRun | null>;
  list(limit?: number): Promise<StoredRun[]>;
};

export function createMcpRunService(deps: RunServiceDeps): RunService {
  const now = deps.now ?? (() => Date.now());
  const execute = deps.execute ?? refusingExecutor;

  async function persist(runId: number, state: RunState): Promise<StoredRun | null> {
    return deps.runs.save(runId, state);
  }

  async function decide(runId: number, state: RunState): Promise<StepResult> {
    const saved = await persist(runId, state);
    if (!saved) return { ok: false, reason: "Lauf konnte nicht gespeichert werden." };
    const summary = summarizeRun(state);
    if (state.status === "paused") {
      return { ok: true, run: saved, state, action: "paused", detail: summary.summary };
    }
    if (state.status === "completed" || state.status === "aborted" || state.status === "failed") {
      return { ok: true, run: saved, state, action: "completed", detail: summary.summary };
    }
    return { ok: true, run: saved, state, action: "waiting", detail: summary.summary };
  }

  return {
    async start(input) {
      const plan = await deps.plans.get(input.planId);
      if (!plan) return { ok: false, reason: `Plan ${input.planId} nicht gefunden.` };
      const storedPlan = plan.plan as TeamPlan;
      const budget = input.budgetCents ?? storedPlan.budgetCents;
      if (budget <= 0) return { ok: false, reason: "Budget muss groesser als 0 Cent sein." };
      if (storedPlan.tasks.length === 0) return { ok: false, reason: "Plan ohne Aufgaben." };

      const limits: RunLimitsConfig = { ...DEFAULT_RUN_LIMITS, ...input.limits, budgetCents: budget };
      const state = startRun(createRunState({ plan: storedPlan, limits, nowMs: now() }), now());
      const created = await deps.runs.create({ planId: input.planId, state, actor: input.actor ?? null });
      return {
        ok: true,
        run: created,
        state,
        action: "waiting",
        detail: `Lauf gestartet: ${storedPlan.tasks.length} Aufgaben, Budget ${budget} Cent.`,
      };
    },

    async step(runId) {
      const stored = await deps.runs.get(runId);
      if (!stored) return { ok: false, reason: `Lauf ${runId} nicht gefunden.` };
      const state = stored.state;
      if (["aborted", "completed", "failed"].includes(state.status)) {
        return { ok: true, run: stored, state, action: "completed", detail: summarizeRun(state).summary };
      }

      const next = nextTask(state);
      if (next.kind === "done") {
        return decide(runId, finalizeRun(state, now()));
      }
      if (next.kind === "aborted") return decide(runId, state);
      if (next.kind === "waiting") {
        return decide(runId, finalizeRun(state, now()));
      }
      if (next.kind === "needs_approval") {
        const paused: RunState = { ...state, status: "paused", approvals: [...new Set([...state.approvals, next.task.id])] };
        return decide(runId, paused);
      }

      const task = next.task;
      const guard = canExecute(state, task);
      if (!guard.ok) {
        return decide(runId, { ...state, status: state.status === "paused" ? "paused" : state.status });
      }

      const agentKey = task.assignee as string;
      const attempt = (state.tasks[task.id]?.attempts ?? 0) + 1;
      const startedAt = now();
      let outcome;
      try {
        outcome = await execute({ task, agentKey, attempt });
      } catch (error) {
        outcome = {
          ok: false,
          costCents: 0,
          durationMs: 0,
          retryable: false,
          note: `Executor-Fehler: ${error instanceof Error ? error.message : "unbekannt"}.`,
        };
      }
      const durationMs = outcome.durationMs > 0 ? outcome.durationMs : now() - startedAt;

      let nextState = applyStep(state, {
        taskId: task.id,
        outcome: outcome.ok ? "success" : outcome.retryable ? "failed" : "failed",
        costCents: outcome.costCents,
        durationMs,
        note: outcome.note ?? (outcome.code ?? ""),
        nowMs: now(),
      });

      // Nicht wiederholbare Fehler beenden den Lauf sofort, statt still zu wiederholen.
      if (!outcome.ok && !outcome.retryable) {
        nextState = {
          ...nextState,
          tasks: { ...nextState.tasks, [task.id]: { ...nextState.tasks[task.id], status: "failed" } },
          status: "failed",
          abortReason: `${task.id}: ${outcome.code ?? "fehlgeschlagen"}${outcome.note ? ` (${outcome.note})` : ""}`.slice(0, 300),
          finishedAtMs: now(),
        };
      }

      if (nextState.status === "running") nextState = finalizeRun(nextState, now());
      return decide(runId, nextState);
    },

    async advance(runId, maxIterations = 10) {
      let last: StepResult = { ok: false, reason: "Kein Schritt ausgefuehrt." };
      for (let index = 0; index < Math.max(1, Math.min(maxIterations, 50)); index += 1) {
        last = await this.step(runId);
        if (!last.ok) return last;
        if (last.action !== "executed" && last.action !== "waiting") return last;
        if (last.state.status !== "running") return last;
        const upcoming = nextTask(last.state);
        if (upcoming.kind !== "runnable") return last;
      }
      return last;
    },

    async approve(runId, taskId) {
      const stored = await deps.runs.get(runId);
      if (!stored) return { ok: false, reason: `Lauf ${runId} nicht gefunden.` };
      if (!stored.state.tasks[taskId]) return { ok: false, reason: `Aufgabe "${taskId}" ist nicht Teil des Laufs.` };
      return decide(runId, approveTask(stored.state, taskId));
    },

    async abort(runId, reason) {
      const stored = await deps.runs.get(runId);
      if (!stored) return { ok: false, reason: `Lauf ${runId} nicht gefunden.` };
      if (stored.state.status === "completed") return { ok: false, reason: "Abgeschlossene Laeufe lassen sich nicht abbrechen." };
      return decide(runId, abortRun(stored.state, reason, now()));
    },

    async get(runId) {
      return deps.runs.get(runId);
    },

    async list(limit) {
      return deps.runs.list(limit);
    },
  };
}

/**
 * Sprint 8 — Run-Engine: Plan ausfuehren, Limits durchsetzen, sauber abbrechen.
 *
 * Reine Zustandslogik: kein Netzwerk, keine echte Uhr, keine Datenbank. Die
 * Ausfuehrung eines Schritts wird injiziert (`TaskExecutor`), damit der Loop
 * deterministisch testbar bleibt und ein Fehlschlag nicht als Erfolg gilt.
 *
 * Grundsaetze:
 *  - Jeder Schritt kostet sichtbar Budget und Schritte, auch Fehlschlaege.
 *  - Ein erreichtes Limit bricht ab — es gibt kein "weiter mit Warnung".
 *  - Freigabepflichtige Aufgaben halten den Lauf an, sie laufen nicht heimlich.
 *  - Ein fehlgeschlagener Schritt ist ein Fehlschlag, nicht "erledigt".
 */
import {
  evaluateRunLimits,
  type TeamPlan,
  type TeamTask,
} from "./mcp-team-orchestration-logic";

export type TaskOutcome = "success" | "failed" | "approval_required" | "skipped";

export type StepRecord = {
  step: number;
  taskId: string;
  agentKey: string | null;
  outcome: TaskOutcome;
  attempt: number;
  costCents: number;
  durationMs: number;
  note: string;
};

export type TaskState = {
  status: "pending" | "running" | "done" | "failed" | "skipped" | "blocked";
  attempts: number;
  costCents: number;
};

export type RunStatus = "pending" | "running" | "paused" | "completed" | "aborted" | "failed";

export type RunLimitsConfig = {
  budgetCents: number;
  maxSteps: number;
  maxDurationMs: number;
  maxAttemptsPerTask: number;
};

export type RunState = {
  plan: TeamPlan;
  status: RunStatus;
  limits: RunLimitsConfig;
  startedAtMs: number;
  finishedAtMs: number | null;
  steps: StepRecord[];
  spentCents: number;
  stepsUsed: number;
  tasks: Record<string, TaskState>;
  /** Aufgaben, die auf menschliche Freigabe warten. */
  approvals: string[];
  approved: string[];
  abortReason: string | null;
};

export const DEFAULT_MAX_ATTEMPTS = 2;

export function createRunState(input: {
  plan: TeamPlan;
  limits: RunLimitsConfig;
  nowMs: number;
}): RunState {
  const tasks: Record<string, TaskState> = {};
  for (const task of input.plan.tasks) {
    tasks[task.id] = { status: "pending", attempts: 0, costCents: 0 };
  }
  return {
    plan: input.plan,
    status: "pending",
    limits: input.limits,
    startedAtMs: input.nowMs,
    finishedAtMs: null,
    steps: [],
    spentCents: 0,
    stepsUsed: 0,
    tasks,
    approvals: [],
    approved: [],
    abortReason: null,
  };
}

export function startRun(state: RunState, nowMs: number): RunState {
  if (state.status !== "pending") return state;
  return { ...state, status: "running", startedAtMs: nowMs };
}

export type NextTaskResult =
  | { kind: "runnable"; task: TeamTask }
  | { kind: "needs_approval"; task: TeamTask }
  | { kind: "waiting"; reason: string }
  | { kind: "done"; reason: string }
  | { kind: "aborted"; reason: string };

/** Naechste Aufgabe in Planreihenfolge, deren Abhaengigkeiten erfuellt sind. */
export function nextTask(state: RunState): NextTaskResult {
  if (state.abortReason) return { kind: "aborted", reason: state.abortReason };

  const failedDeps: string[] = [];
  for (const taskId of state.plan.order) {
    const task = state.plan.tasks.find((entry) => entry.id === taskId);
    if (!task) continue;
    const taskState = state.tasks[task.id];
    if (!taskState || taskState.status !== "pending") continue;

    const deps = task.dependsOn.map((dep) => ({ dep, state: state.tasks[dep] }));
    if (deps.some((entry) => entry.state?.status === "failed")) {
      failedDeps.push(task.id);
      continue;
    }
    if (deps.some((entry) => entry.state && entry.state.status !== "done" && entry.state.status !== "skipped")) {
      continue;
    }
    if (task.requiresApproval && !state.approved.includes(task.id)) {
      return { kind: "needs_approval", task };
    }
    if (task.assignee === null) {
      return { kind: "waiting", reason: `Aufgabe "${task.id}" hat keinen Agenten und wird uebersprungen.` };
    }
    return { kind: "runnable", task };
  }

  const open = Object.values(state.tasks).filter((task) => task.status === "pending");
  if (open.length === 0) return { kind: "done", reason: "Alle Aufgaben sind abgeschlossen." };
  if (failedDeps.length > 0) {
    return { kind: "waiting", reason: `Blockiert durch fehlgeschlagene Vorgaenger: ${failedDeps.join(", ")}.` };
  }
  return { kind: "waiting", reason: "Keine Aufgabe ist aktuell ausfuehrbar." };
}

export type StepOutcome = {
  ok: boolean;
  costCents: number;
  durationMs: number;
  note?: string;
  /** Fehlschlaege sind nur wiederholbar, wenn der Executor das sagt. */
  retryable?: boolean;
  code?: string;
};

export type TaskExecutor = (input: { task: TeamTask; agentKey: string; attempt: number }) => Promise<StepOutcome>;

export type ApplyStepInput = {
  taskId: string;
  outcome: TaskOutcome;
  costCents: number;
  durationMs: number;
  note?: string;
  nowMs: number;
};

/** Verbucht einen Schritt und wertet Limits aus. Reine Funktion. */
export function applyStep(state: RunState, input: ApplyStepInput): RunState {
  const taskState = state.tasks[input.taskId];
  if (!taskState) return state;

  const stepsUsed = state.stepsUsed + 1;
  const spentCents = state.spentCents + Math.max(0, input.costCents);
  const record: StepRecord = {
    step: stepsUsed,
    taskId: input.taskId,
    agentKey: state.plan.tasks.find((task) => task.id === input.taskId)?.assignee ?? null,
    outcome: input.outcome,
    attempt: taskState.attempts,
    costCents: Math.max(0, input.costCents),
    durationMs: Math.max(0, input.durationMs),
    note: input.note ?? "",
  };

  const tasks: Record<string, TaskState> = { ...state.tasks };
  let status: RunStatus = state.status;
  let approvals = state.approvals;
  let abortReason = state.abortReason;

  if (input.outcome === "success" || input.outcome === "skipped") {
    tasks[input.taskId] = { ...taskState, status: input.outcome === "success" ? "done" : "skipped", costCents: taskState.costCents + record.costCents };
  } else if (input.outcome === "approval_required") {
    tasks[input.taskId] = { ...taskState, status: "pending", attempts: taskState.attempts + 1 };
    approvals = [...new Set([...state.approvals, input.taskId])];
    status = "paused";
  } else {
    const attempts = taskState.attempts + 1;
    const exhausted = attempts >= state.limits.maxAttemptsPerTask;
    tasks[input.taskId] = {
      status: exhausted ? "failed" : "pending",
      attempts,
      costCents: taskState.costCents + record.costCents,
    };
    if (exhausted) status = "failed";
  }

  const next: RunState = {
    ...state,
    status,
    steps: [...state.steps, record],
    spentCents,
    stepsUsed,
    tasks,
    approvals,
    abortReason,
  };

  const limits = evaluateRunLimits({
    budgetCents: next.limits.budgetCents,
    maxSteps: next.limits.maxSteps,
    maxDurationMs: next.limits.maxDurationMs,
    spentCents,
    stepsUsed,
    elapsedMs: Math.max(0, input.nowMs - state.startedAtMs),
  });

  if (limits.shouldAbort) {
    const reason = limits.reasons.join(" ");
    return {
      ...next,
      status: "aborted",
      abortReason: reason,
      finishedAtMs: input.nowMs,
      tasks: markOpenTasks(next.tasks, "skipped"),
    };
  }

  return next;
}

function markOpenTasks(tasks: Record<string, TaskState>, status: TaskState["status"]): Record<string, TaskState> {
  const next: Record<string, TaskState> = {};
  for (const [id, task] of Object.entries(tasks)) {
    next[id] = task.status === "pending" && task.attempts === 0 ? { ...task, status } : task;
  }
  return next;
}

/** Menschliche Freigabe fuer eine Aufgabe erteilen. */
export function approveTask(state: RunState, taskId: string): RunState {
  if (!state.tasks[taskId]) return state;
  const approvals = state.approvals.filter((id) => id !== taskId);
  const approved = [...new Set([...state.approved, taskId])];
  const blocked = state.status === "paused" && approvals.length === 0 && state.abortReason === null;
  return { ...state, approvals, approved, status: blocked ? "running" : state.status };
}

/** Lauf beenden, wenn nichts mehr zu tun ist. Idempotent. */
export function finalizeRun(state: RunState, nowMs: number): RunState {
  if (state.status === "completed" || state.status === "aborted") return state;
  const values = Object.values(state.tasks);
  if (values.some((task) => task.status === "failed")) {
    const failed = Object.entries(state.tasks).filter(([, task]) => task.status === "failed").map(([id]) => id);
    return { ...state, status: "failed", finishedAtMs: nowMs, abortReason: `Fehlgeschlagene Aufgaben: ${failed.join(", ")}.` };
  }
  if (values.some((task) => task.status === "pending" || task.status === "running")) return state;
  if (state.status === "paused") return state;
  return { ...state, status: "completed", finishedAtMs: nowMs };
}

export function abortRun(state: RunState, reason: string, nowMs: number): RunState {
  return {
    ...state,
    status: "aborted",
    abortReason: reason.slice(0, 300),
    finishedAtMs: nowMs,
    tasks: markOpenTasks(state.tasks, "skipped"),
  };
}

export type RunSummary = {
  status: RunStatus;
  steps: number;
  spentCents: number;
  budgetCents: number;
  done: number;
  failed: number;
  open: number;
  summary: string;
};

export function summarizeRun(state: RunState): RunSummary {
  const values = Object.values(state.tasks);
  const done = values.filter((task) => task.status === "done").length;
  const failed = values.filter((task) => task.status === "failed").length;
  const open = values.filter((task) => task.status === "pending" || task.status === "running").length;
  const statusText: Record<RunStatus, string> = {
    pending: "bereit",
    running: "laeuft",
    paused: "wartet auf Freigabe",
    completed: "abgeschlossen",
    aborted: "abgebrochen",
    failed: "fehlgeschlagen",
  };
  const reason = state.abortReason ? ` Grund: ${state.abortReason}` : "";
  return {
    status: state.status,
    steps: state.stepsUsed,
    spentCents: state.spentCents,
    budgetCents: state.limits.budgetCents,
    done,
    failed,
    open,
    summary: `Lauf ${statusText[state.status]}: ${done} erledigt, ${failed} fehlgeschlagen, ${open} offen, ${state.stepsUsed} Schritte, ${state.spentCents} von ${state.limits.budgetCents} Cent.${reason}`,
  };
}

/** Restbudget fuer eine Aufgabe (Delegation und Freigaben). */
export function remainingBudget(state: RunState): number {
  return Math.max(0, state.limits.budgetCents - state.spentCents);
}

/** Prueft, ob ein Schritt ueberhaupt gestartet werden darf. */
export function canExecute(state: RunState, task: TeamTask): { ok: true } | { ok: false; reason: string } {
  if (state.status === "aborted" || state.status === "completed" || state.status === "failed") {
    return { ok: false, reason: `Lauf ist beendet (${state.status}).` };
  }
  if (task.requiresApproval && !state.approved.includes(task.id)) {
    return { ok: false, reason: `Aufgabe "${task.id}" braucht eine menschliche Freigabe.` };
  }
  if (task.assignee === null) return { ok: false, reason: `Aufgabe "${task.id}" hat keinen Agenten.` };
  const limits = evaluateRunLimits({
    budgetCents: state.limits.budgetCents,
    maxSteps: state.limits.maxSteps,
    maxDurationMs: state.limits.maxDurationMs,
    spentCents: state.spentCents,
    stepsUsed: state.stepsUsed,
    elapsedMs: 0,
  });
  if (!limits.ok && limits.reasons.some((reason) => !reason.startsWith("Laufzeitlimit"))) {
    return { ok: false, reason: limits.reasons.join(" ") };
  }
  return { ok: true };
}

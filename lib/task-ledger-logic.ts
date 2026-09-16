/**
 * Task-Ledger-Form (rein, testbar) — Fix fuer den Workflows-Tab-White-Screen.
 *
 * Hintergrund: `orchestrator.tasks` liefert nur Index-Einträge
 * (id, title, status, createdAt, updatedAt) — ohne steps und
 * correctionIterations. Der Superagent-Tab behandelte sie aber als volle
 * TaskRecords und las `task.steps.length` → TypeError → weisser Bildschirm,
 * sobald ein Task im Ledger steht. Diese Funktionen normalisieren jede
 * Ledger-Antwort defensiv: fehlende Felder bekommen harmlose Defaults,
 * unbekannte Status werden auf "pending" gemappt — render-seitig kann
 * damit nichts mehr crashen, egal was der Server liefert.
 */

export type TaskStatus = "pending" | "running" | "success" | "failed" | "escalated";
export type StepStatus = "pending" | "running" | "success" | "failed";

export interface LedgerStep {
  id: string;
  name: string;
  status: StepStatus;
  attempts: number;
  error?: string;
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
}

export interface LedgerTask {
  id: string;
  title: string;
  objective: string;
  status: TaskStatus;
  correctionIterations: number;
  steps: LedgerStep[];
  finalAnswer?: unknown;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_TASK_STATUS: readonly TaskStatus[] = ["pending", "running", "success", "failed", "escalated"];
const KNOWN_STEP_STATUS: readonly StepStatus[] = ["pending", "running", "success", "failed"];

export function normalizeTaskStatus(raw: unknown): TaskStatus {
  return KNOWN_TASK_STATUS.includes(raw as TaskStatus) ? (raw as TaskStatus) : "pending";
}

export function normalizeStepStatus(raw: unknown): StepStatus {
  return KNOWN_STEP_STATUS.includes(raw as StepStatus) ? (raw as StepStatus) : "pending";
}

function coerceStep(raw: unknown): LedgerStep {
  const step = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof step.id === "string" ? step.id : `step-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof step.name === "string" ? step.name : "Unbenannter Schritt",
    status: normalizeStepStatus(step.status),
    attempts: Number.isFinite(Number(step.attempts)) ? Number(step.attempts) : 1,
    error: typeof step.error === "string" ? step.error : undefined,
    logs: Array.isArray(step.logs) ? (step.logs.filter((l) => typeof l === "string") as string[]) : [],
    startedAt: typeof step.startedAt === "string" ? step.startedAt : undefined,
    finishedAt: typeof step.finishedAt === "string" ? step.finishedAt : undefined,
  };
}

/** Macht JEDE Ledger-/Task-Antwort (Index-Eintrag oder Vollrecord) render-sicher. */
export function coerceLedgerTask(raw: unknown): LedgerTask {
  const task = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  return {
    id: typeof task.id === "string" ? task.id : `task-${Math.random().toString(36).slice(2, 8)}`,
    title: typeof task.title === "string" && task.title.trim() ? task.title : "Autonome Aufgabe",
    objective: typeof task.objective === "string" ? task.objective : "",
    status: normalizeTaskStatus(task.status),
    correctionIterations: Number.isFinite(Number(task.correctionIterations)) ? Number(task.correctionIterations) : 0,
    steps: Array.isArray(task.steps) ? (task.steps as unknown[]).map(coerceStep) : [],
    finalAnswer: task !== null && typeof task === "object" && "finalAnswer" in task ? task.finalAnswer : undefined,
    createdAt: typeof task.createdAt === "string" ? task.createdAt : nowIso,
    updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : nowIso,
  };
}

/**
 * Orchestrator-State-Store (Sprint 123).
 *
 * Zentrales Task-Ledger fuer den Leitenden-Superagenten: Jede Orchestrator-
 * Aufgabe wird als TaskRecord mit atomaren Teilschritten (Steps) persistiert —
 * Status, Fehlermeldungen und Logs sind damit lueckenlos nachverfolgbar.
 *
 * Speicher-Backend: Neon-PostgreSQL ueber die bestehende generische KV-Tabelle
 * (modelRouterSettings) mit JSON-Werten — kein Schema-Migration noetig.
 *   - "orchestrator.taskIndex"  -> Array von Task-Summaries (neueste zuerst)
 *   - "orchestrator.task.<id>"  -> vollstaendiger TaskRecord
 */

import * as db from "../db";
import { randomUUID } from "crypto";

export type StepStatus = "pending" | "running" | "success" | "failed";
export type TaskStatus = "pending" | "running" | "success" | "failed" | "escalated";

export interface StepRecord {
  id: string;
  name: string;
  status: StepStatus;
  attempts: number;
  /** Fehlermeldung des letzten Fehlversuchs (falls fehlgeschlagen). */
  error?: string;
  /** Chronologische Log-Eintraege fuer lueckenlose Nachverfolgbarkeit. */
  logs: string[];
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
}

export interface TaskRecord {
  id: string;
  title: string;
  objective: string;
  status: TaskStatus;
  /** Anzahl Selbstkorrektur-Iterationen (Eskalation nach 3 Fehlversuchen). */
  correctionIterations: number;
  steps: StepRecord[];
  /** Optional: finales, strukturiertes Ergebnis des Superagenten. */
  finalAnswer?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface TaskIndexEntry {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

const INDEX_KEY = "orchestrator.taskIndex";
const TASK_KEY_PREFIX = "orchestrator.task.";
const MAX_INDEX_ENTRIES = 200;

function nowIso(): string {
  return new Date().toISOString();
}

function taskKey(id: string): string {
  return `${TASK_KEY_PREFIX}${id}`;
}

/** Neuen Task im Ledger anlegen (Status: pending). */
export async function createTask(input: { title: string; objective: string }): Promise<TaskRecord> {
  const record: TaskRecord = {
    id: randomUUID(),
    title: input.title,
    objective: input.objective,
    status: "pending",
    correctionIterations: 0,
    steps: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await persistTask(record);
  await addToIndex(record);
  return record;
}

/** Task laden. Wirft bei unbekannter Id nicht — sondern gibt null zurueck. */
export async function getTask(id: string): Promise<TaskRecord | null> {
  try {
    return await db.getModelRouterSetting<TaskRecord>(taskKey(id));
  } catch {
    return null;
  }
}

/** Neuen Schritt registrieren (Status: pending, dann running). */
export async function addStep(taskId: string, name: string): Promise<StepRecord | null> {
  const task = await getTask(taskId);
  if (!task) return null;
  const step: StepRecord = {
    id: randomUUID(),
    name,
    status: "pending",
    attempts: 0,
    logs: [],
    startedAt: nowIso(),
  };
  task.steps.push(step);
  task.updatedAt = nowIso();
  await persistTask(task);
  return step;
}

/** Schritt-Status aktualisieren (inkl. Fehlermeldung/Ergebnis). */
export async function updateStep(
  taskId: string,
  stepId: string,
  patch: { status: StepStatus; error?: string; result?: unknown },
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  const step = task.steps.find((entry) => entry.id === stepId);
  if (!step) return;
  step.status = patch.status;
  step.attempts += 1;
  if (patch.error !== undefined) step.error = patch.error;
  if (patch.result !== undefined) step.result = patch.result;
  if (patch.status === "success" || patch.status === "failed") step.finishedAt = nowIso();
  task.updatedAt = nowIso();
  await persistTask(task);
}

/** Log-Eintrag an einen Schritt anhaengen (chronologisch, begrenzt). */
export async function appendStepLog(taskId: string, stepId: string, line: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  const step = task.steps.find((entry) => entry.id === stepId);
  if (!step) return;
  step.logs.push(`[${nowIso()}] ${line}`);
  if (step.logs.length > 100) step.logs.splice(0, step.logs.length - 100);
  task.updatedAt = nowIso();
  await persistTask(task);
}

/** Task-Abschluss verbuchen (success | failed | escalated). */
export async function finishTask(taskId: string, status: TaskStatus, finalAnswer?: unknown): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  task.status = status;
  if (finalAnswer !== undefined) task.finalAnswer = finalAnswer;
  task.updatedAt = nowIso();
  await persistTask(task);
  await addToIndex(task);
}

/** Selbstkorrektur-Iteration zaehlen (Eskalationsschwelle: 3). */
export async function recordCorrectionIteration(taskId: string): Promise<number> {
  const task = await getTask(taskId);
  if (!task) return 0;
  task.correctionIterations += 1;
  task.updatedAt = nowIso();
  await persistTask(task);
  return task.correctionIterations;
}

/** Alle Tasks als Uebersicht (neueste zuerst). */
export async function listTasks(limit = 50): Promise<TaskIndexEntry[]> {
  try {
    const index = await db.getModelRouterSetting<TaskIndexEntry[]>(INDEX_KEY);
    if (!Array.isArray(index)) return [];
    return index.slice(0, limit);
  } catch {
    return [];
  }
}

async function persistTask(record: TaskRecord): Promise<void> {
  await db.setModelRouterSetting(taskKey(record.id), record);
}

async function addToIndex(task: TaskRecord): Promise<void> {
  let index: TaskIndexEntry[] = [];
  try {
    const existing = await db.getModelRouterSetting<TaskIndexEntry[]>(INDEX_KEY);
    if (Array.isArray(existing)) index = existing;
  } catch {
    index = [];
  }
  const entry: TaskIndexEntry = {
    id: task.id,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  const withoutDuplicate = index.filter((item) => item.id !== task.id);
  withoutDuplicate.unshift(entry);
  if (withoutDuplicate.length > MAX_INDEX_ENTRIES) withoutDuplicate.length = MAX_INDEX_ENTRIES;
  await db.setModelRouterSetting(INDEX_KEY, withoutDuplicate);
}

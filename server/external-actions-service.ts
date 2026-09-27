/**
 * Sprint 268 — Persistenter Level-3-Flow fuer externe Aktionen (KV).
 * Der Service erzwingt Zustand und Audit-Spur; das eigentliche Senden
 * machen die Fachdienste (E-Mail etc.) — nur nach Freigabe.
 */
import * as db from "./db";
import {
  applyApprovalDecision,
  markExecution,
  validateExternalActionDraft,
  type ExternalActionRecord,
} from "../lib/external-action-logic";

const INDEX_KEY = "externalActions.index";
const RECORD_PREFIX = "externalActions.record.";

async function listRecords(): Promise<ExternalActionRecord[]> {
  const ids = (await db.getModelRouterSetting<string[]>(INDEX_KEY)) ?? [];
  const records = await Promise.all(ids.map(async (id) => (await db.getModelRouterSetting<ExternalActionRecord>(`${RECORD_PREFIX}${id}`)) ?? null));
  return records.filter((record): record is ExternalActionRecord => record !== null);
}

export async function createExternalActionDraft(draft: Partial<ExternalActionRecord>): Promise<{ ok: true; record: ExternalActionRecord } | { ok: false; reason: string }> {
  const validation = validateExternalActionDraft(draft);
  if (!validation.valid) return { ok: false, reason: validation.reason };
  const record: ExternalActionRecord = {
    id: draft.id!,
    kind: draft.kind!,
    payloadPreview: draft.payloadPreview!,
    createdAt: draft.createdAt ?? Date.now(),
    idempotencyKey: draft.idempotencyKey!,
    status: "pending_approval",
    decidedAt: null,
    executedAt: null,
    outcome: null,
  };
  const existing = await db.getModelRouterSetting<ExternalActionRecord>(`${RECORD_PREFIX}${record.id}`);
  if (existing) return { ok: false, reason: "Eine Aktion mit dieser ID existiert bereits — Idempotenz vor Kollision." };
  await db.setModelRouterSetting(`${RECORD_PREFIX}${record.id}`, record);
  const ids = (await db.getModelRouterSetting<string[]>(INDEX_KEY)) ?? [];
  await db.setModelRouterSetting(INDEX_KEY, [...ids, record.id].slice(-200));
  return { ok: true, record };
}

export async function decideExternalAction(id: string, decision: Parameters<typeof applyApprovalDecision>[1]): Promise<{ ok: true; record: ExternalActionRecord } | { ok: false; reason: string }> {
  const record = await db.getModelRouterSetting<ExternalActionRecord>(`${RECORD_PREFIX}${id}`);
  if (!record) return { ok: false, reason: "Aktion nicht gefunden." };
  const updated = applyApprovalDecision(record, decision);
  await db.setModelRouterSetting(`${RECORD_PREFIX}${id}`, updated);
  return { ok: true, record: updated };
}

export async function completeExternalAction(id: string, outcome: string, ok: boolean): Promise<{ ok: true; record: ExternalActionRecord } | { ok: false; reason: string }> {
  const record = await db.getModelRouterSetting<ExternalActionRecord>(`${RECORD_PREFIX}${id}`);
  if (!record) return { ok: false, reason: "Aktion nicht gefunden." };
  const updated = markExecution(record, outcome, ok);
  await db.setModelRouterSetting(`${RECORD_PREFIX}${id}`, updated);
  return { ok: true, record: updated };
}

export async function listAudit(): Promise<string[]> {
  const records = await listRecords();
  return records
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((record) => `[${new Date(record.createdAt).toISOString()}] ${record.kind} ${record.id} -> ${record.status}`);
}

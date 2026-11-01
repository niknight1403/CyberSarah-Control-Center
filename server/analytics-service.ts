/**
 * Sprint 267 — Analytics-Speicher: Tages-Buckets in KV, keine Sessions.
 */
import * as db from "./db";
import { accumulateEvent, buildFunnelSummary, isValidEventKind, pruneBuckets } from "../lib/analytics-logic";

const BUCKETS_KEY = "analytics.buckets";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordEvent(kind: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidEventKind(kind)) return { ok: false, reason: "Unbekannte Ereignis-Art." };
  const day = today();
  const buckets = (await db.getModelRouterSetting<Record<string, object>>(BUCKETS_KEY)) ?? {};
  const accumulated = accumulateEvent(buckets, kind, day);
  const pruned = pruneBuckets(accumulated, day);
  await db.setModelRouterSetting(BUCKETS_KEY, pruned.buckets);
  return { ok: true };
}

export async function getFunnelSummary() {
  const buckets = (await db.getModelRouterSetting<Record<string, object>>(BUCKETS_KEY)) ?? {};
  return { summary: buildFunnelSummary(buckets), retentionNote: "Tages-Buckets, 90 Tage Retention, keine Sessions, keine PII." };
}

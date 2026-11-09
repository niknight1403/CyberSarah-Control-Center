/**
 * Kontrollierte Wiederaufnahme fehlgeschlagener Publikations-Jobs (Service).
 *
 * Nimmt nur Jobs an, die noch nie beim Provider waren, deren Ursache
 * wiederholbar ist und deren Versuchsbudget nicht aufgebraucht ist. Bei
 * auth-Fehlern wird zuerst das Token erneuert; ohne verwendbares Token bleibt
 * der Job liegen statt blind erneut zu scheitern.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { publishingJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveXToken, xTokenDiagnostics } from "./x-token-service";
import {
  planFailedJobRetries,
  summarizeRetryPlan,
  SYSTEM_RETRY_MAX_PER_RUN,
  type RetryDecision,
} from "../lib/publishing-retry-logic";

export type RetryRunResult = {
  ok: boolean;
  dryRun: boolean;
  considered: number;
  requeued: number;
  skipped: Array<{ id: number; reason: string }>;
  tokenRefresh: { attempted: boolean; ok: boolean; detail?: string } | null;
  detail?: string;
};

/** Holt Kandidaten: fehlgeschlagen, nie beim Provider, aelteste zuerst. */
async function loadCandidates(limit: number) {
  const db = await getDb();
  if (!db) return null;
  return db
    .select({
      id: publishingJobs.id,
      platform: publishingJobs.platform,
      status: publishingJobs.status,
      attempts: publishingJobs.attempts,
      lastError: publishingJobs.lastError,
      mode: publishingJobs.mode,
    })
    .from(publishingJobs)
    .where(and(eq(publishingJobs.status, "fehlgeschlagen"), isNull(publishingJobs.mode)))
    .orderBy(asc(publishingJobs.updatedAt))
    .limit(Math.min(Math.max(limit, 1) * 4, 100));
}

export async function retryFailedJobsControlled(options: {
  limit?: number;
  dryRun?: boolean;
  now?: Date;
} = {}): Promise<RetryRunResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(options.limit ?? SYSTEM_RETRY_MAX_PER_RUN, SYSTEM_RETRY_MAX_PER_RUN);
  const dryRun = options.dryRun === true;
  const empty: RetryRunResult = {
    ok: true, dryRun, considered: 0, requeued: 0, skipped: [], tokenRefresh: null,
  };

  const rows = await loadCandidates(limit);
  if (!rows) return { ...empty, ok: false, detail: "Datenbank nicht verfuegbar." };

  // Vor dem Planen: gibt es fuer X ueberhaupt ein verwendbares Token?
  let tokenRefresh: RetryRunResult["tokenRefresh"] = null;
  let xTokenReady: boolean | null = null;
  const hasXJobs = rows.some((row) => row.platform === "x");
  if (hasXJobs) {
    try {
      const diagnostics = await xTokenDiagnostics(now);
      xTokenReady = diagnostics.credentialsPresent || diagnostics.storedTokenPresent;
      if (!diagnostics.credentialsPresent && !diagnostics.storedTokenPresent) {
        xTokenReady = false;
      }
    } catch {
      xTokenReady = null;
    }
  }

  const plan = planFailedJobRetries({
    jobs: rows,
    limit,
    tokenReady: (platform) => (platform === "x" ? xTokenReady !== false : true),
  });

  // Wenn auth-Jobs anstehen: Token wirklich erneuern, statt auf Verdacht zu posten.
  if (!dryRun && plan.retries.some((entry) => entry.needsTokenRefresh && rows.some((r) => r.id === entry.id && r.platform === "x"))) {
    try {
      const resolved = await resolveXToken({ force: true, now });
      tokenRefresh = {
        attempted: true,
        ok: Boolean(resolved.token),
        detail: resolved.token ? "X-Token erneuert." : resolved.reason,
      };
    } catch (error) {
      tokenRefresh = { attempted: true, ok: false, detail: error instanceof Error ? error.message : "unbekannter Fehler" };
    }
  }

  if (dryRun) {
    return {
      ...empty,
      considered: rows.length,
      skipped: plan.skipped.map((entry) => ({ id: entry.id, reason: entry.reason })),
      tokenRefresh,
      detail: `Trockenlauf: ${summarizeRetryPlan(plan)}`,
    };
  }

  const db = await getDb();
  if (!db) return { ...empty, ok: false, detail: "Datenbank nicht verfuegbar." };

  const requeued: number[] = [];
  for (const entry of plan.retries) {
    const updated = await db
      .update(publishingJobs)
      .set({
        status: "geplant",
        attempts: rows.find((row) => row.id === entry.id)?.attempts ?? 0,
        lastError: null,
        mode: null,
        scheduledFor: new Date(now.getTime() + entry.delayMs),
        updatedAt: now,
      })
      .where(and(
        eq(publishingJobs.id, entry.id),
        eq(publishingJobs.status, "fehlgeschlagen"),
        isNull(publishingJobs.mode),
      ))
      .returning({ id: publishingJobs.id });
    if (updated.length) requeued.push(entry.id);
  }

  return {
    ok: true,
    dryRun: false,
    considered: rows.length,
    requeued: requeued.length,
    skipped: plan.skipped.map((entry: RetryDecision) => ({ id: entry.id, reason: entry.reason })),
    tokenRefresh,
    detail: `${requeued.length} erneut eingeplant, ${plan.skipped.length} uebersprungen`,
  };
}

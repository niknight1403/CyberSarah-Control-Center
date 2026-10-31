/**
 * Shared PostgreSQL state transitions used by all Publishing-Autopilot workers.
 * CAS is atomic across connections/instances; no local mutex or TTL unlock
 * that could re-send a potentially accepted provider request.
 */
import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { publishingJobs, type PublishingJobRow } from "../drizzle/schema";
import { STALE_PUBLISHING_CLAIM_MINUTES, UNCERTAIN_PUBLISHING_MESSAGE, isConfirmedPublishingReceipt, nextRetryAt } from "../lib/publishing-queue-logic";
import type { getDb } from "./db";

type PublishingDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function claimDuePublishingJob(
  db: PublishingDb,
  jobId: number,
  userOpenId: string,
  now: Date,
): Promise<PublishingJobRow | null> {
  const [job] = await db.update(publishingJobs).set({
    status: "in_bearbeitung",
    attempts: sql`${publishingJobs.attempts} + 1`,
    lastError: null,
    mode: null,
    updatedAt: new Date(),
  }).where(and(
    eq(publishingJobs.id, jobId),
    eq(publishingJobs.userOpenId, userOpenId),
    eq(publishingJobs.status, "geplant"),
    lte(publishingJobs.scheduledFor, now),
  )).returning();
  return job ?? null;
}

export type StalePublishingRecovery = {
  /** No outbound request could have started: requeued after backoff. */
  requeued: number;
  /** Safe preflight recovery exceeded the allowed retry budget. */
  failed: number;
  /** Provider may have received the post: never replay automatically. */
  uncertain: number;
};

/**
 * Recover a crashed publishing worker using the persisted dispatch boundary.
 *
 * mode IS NULL proves that the network-dispatch gate was never armed.
 * Every row transition is conditional on the ACTIVE state and stale cutoff;
 * parallel workers racing for recovery cannot modify the same row twice.
 * Once the dispatch boundary is armed (mode is non-null), the safest
 * possible action is quarantine, regardless of the HTTP result.
 *
 * No external network calls or customer-facing posts occur in this function.
 */
export async function recoverStalePublishingClaimsDb(
  db: PublishingDb,
  now = new Date(),
): Promise<StalePublishingRecovery> {
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_CLAIM_MINUTES * 60_000);
  const activeAndStale = and(
    eq(publishingJobs.status, "in_bearbeitung"),
    lte(publishingJobs.updatedAt, cutoff),
  );

  // Retry budget follows the same backoff policy as ordinary preflight errors.
  const firstRetry = nextRetryAt(1, now)!;
  const secondRetry = nextRetryAt(2, now)!;
  const first = await db.update(publishingJobs).set({
    status: "geplant",
    mode: null,
    scheduledFor: firstRetry,
    lastError: "Vor dem Plattformversand unterbrochen; sicher erneut geplant (Versuch 1).",
    updatedAt: now,
  }).where(and(activeAndStale, isNull(publishingJobs.mode),
    lte(publishingJobs.attempts, 1))).returning({id: publishingJobs.id});

  const second = await db.update(publishingJobs).set({
    status: "geplant",
    mode: null,
    scheduledFor: secondRetry,
    lastError: "Vor dem Plattformversand unterbrochen; sicher erneut geplant (Versuch 2).",
    updatedAt: now,
  }).where(and(activeAndStale, isNull(publishingJobs.mode),
    eq(publishingJobs.attempts, 2))).returning({id: publishingJobs.id});

  const exhausted = await db.update(publishingJobs).set({
    status: "fehlgeschlagen",
    lastError: "Wiederholungsgrenze vor Plattformversand erreicht; manueller Eingriff nötig.",
    updatedAt: now,
  }).where(and(activeAndStale, isNull(publishingJobs.mode),
    gte(publishingJobs.attempts, 3))).returning({id: publishingJobs.id});

  const uncertain = await db.update(publishingJobs).set({
    status: "versand_ungeklaert",
    lastError: UNCERTAIN_PUBLISHING_MESSAGE,
    updatedAt: now,
  }).where(and(activeAndStale, isNotNull(publishingJobs.mode)))
    .returning({id: publishingJobs.id});

  return {
    requeued: first.length + second.length,
    failed: exhausted.length,
    uncertain: uncertain.length,
  };
}

/** Compatibility helper: returns ONLY unsafe dispatches needing review. */
export async function quarantineStalePublishingClaimsDb(
  db: PublishingDb,
  now = new Date(),
): Promise<number> {
  return (await recoverStalePublishingClaimsDb(db, now)).uncertain;
}

/**
 * Durable send boundary: the call must complete BEFORE any provider API POST.
 * Only the winning claimed worker can arm this transition once.
 */
export async function armPublishingDispatch(
  db: PublishingDb,
  jobId: number,
  userOpenId: string,
  now = new Date(),
): Promise<boolean> {
  const [armed] = await db.update(publishingJobs).set({
    mode: "dispatching",
    updatedAt: now,
  }).where(and(
    eq(publishingJobs.id, jobId),
    eq(publishingJobs.userOpenId, userOpenId),
    eq(publishingJobs.status, "in_bearbeitung"),
    isNull(publishingJobs.mode),
  )).returning({id: publishingJobs.id});
  return Boolean(armed);
}

/** A real provider receipt must be stored, otherwise the outcome is uncertain. */
export async function confirmPublishingReceipt(
  db: PublishingDb,
  jobId: number,
  userOpenId: string,
  externalId: string,
  now = new Date(),
): Promise<boolean> {
  if (!isConfirmedPublishingReceipt(externalId))
    throw new Error("Plattform lieferte keinen überprüfbaren Beitragsschlüssel.");
  const [stored] = await db.update(publishingJobs).set({
    status: "veroeffentlicht",
    mode: "live",
    externalId,
    publishedAt: now,
    lastError: null,
    updatedAt: now,
  }).where(and(
    eq(publishingJobs.id, jobId),
    eq(publishingJobs.userOpenId, userOpenId),
    eq(publishingJobs.status, "in_bearbeitung"),
    eq(publishingJobs.mode, "dispatching"),
  )).returning({id:publishingJobs.id});
  return Boolean(stored);
}

/**
 * Lost acknowledgement or HTTP timeout after an armed send must NEVER
 * requeue a potentially accepted post. Later workers see only the quarantine.
 */
export async function quarantineAmbiguousPublishingDispatch(
  db: PublishingDb,
  jobId: number,
  userOpenId: string,
  now = new Date(),
): Promise<boolean> {
  const [stored] = await db.update(publishingJobs).set({
    status: "versand_ungeklaert",
    lastError: UNCERTAIN_PUBLISHING_MESSAGE,
    updatedAt: now,
  }).where(and(
    eq(publishingJobs.id, jobId),
    eq(publishingJobs.userOpenId, userOpenId),
    eq(publishingJobs.status, "in_bearbeitung"),
    eq(publishingJobs.mode, "dispatching"),
  )).returning({id:publishingJobs.id});
  return Boolean(stored);
}

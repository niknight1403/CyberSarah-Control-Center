/**
 * Shared PostgreSQL state transitions used by all Publishing-Autopilot workers.
 * CAS is atomic across connections/instances; no local mutex or TTL unlock
 * that could re-send a potentially accepted provider request.
 */
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { publishingJobs, type PublishingJobRow } from "../drizzle/schema";
import { STALE_PUBLISHING_CLAIM_MINUTES, UNCERTAIN_PUBLISHING_MESSAGE, isConfirmedPublishingReceipt } from "../lib/publishing-queue-logic";
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

export async function quarantineStalePublishingClaimsDb(
  db: PublishingDb,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_CLAIM_MINUTES * 60_000);
  const rows = await db.update(publishingJobs).set({
    status: "versand_ungeklaert",
    lastError: UNCERTAIN_PUBLISHING_MESSAGE,
    updatedAt: now,
  }).where(and(
    eq(publishingJobs.status, "in_bearbeitung"),
    lte(publishingJobs.updatedAt, cutoff),
  )).returning({id:publishingJobs.id});
  return rows.length;
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

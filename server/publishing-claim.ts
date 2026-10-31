/**
 * Shared PostgreSQL state transitions used by all Publishing-Autopilot workers.
 * CAS is atomic across connections/instances; no local mutex or TTL unlock
 * that could re-send a potentially accepted provider request.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { publishingJobs, type PublishingJobRow } from "../drizzle/schema";
import { STALE_PUBLISHING_CLAIM_MINUTES, UNCERTAIN_PUBLISHING_MESSAGE } from "../lib/publishing-queue-logic";
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

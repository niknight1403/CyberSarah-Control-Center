/**
 * Human-only resolution of uncertain social-media publishing. Does NOT retry.
 * All writes are transactional: CAS status update and append-only evidence.
 */
import { and, desc, eq } from "drizzle-orm";
import { publishingJobs, publishingReviewEvents } from "../drizzle/schema";
import { isConfirmedPublishingReceipt } from "../lib/publishing-queue-logic";
import { getDb } from "./db";

type PublishingDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type PublishingReviewDecision =
  | {resolution: "confirmed_published"; externalId: string; evidence: string}
  | {resolution: "closed_without_replay"; evidence: string};

export function validatePublishingReview(decision: PublishingReviewDecision): void {
  if (decision.evidence.trim().length < 16 || decision.evidence.trim().length > 1200)
    throw new Error("Bitte eine konkrete Prüfgrundlage (16–1200 Zeichen) angeben.");
  if (decision.resolution === "confirmed_published" &&
      (decision.externalId.trim().length < 4 ||
       decision.externalId.trim().length > 300 ||
       !isConfirmedPublishingReceipt(decision.externalId.trim())))
    throw new Error("Für die Bestätigung ist eine echte externe Plattform-Beitrags-ID erforderlich.");
}

export async function listUncertainPublishingForAdmin(
  db: PublishingDb,
  userOpenId: string,
  limit = 50,
) {
  return db.select({
    id: publishingJobs.id,
    product: publishingJobs.product,
    persona: publishingJobs.persona,
    platform: publishingJobs.platform,
    attempts: publishingJobs.attempts,
    updatedAt: publishingJobs.updatedAt,
    scheduledFor: publishingJobs.scheduledFor,
    lastError: publishingJobs.lastError,
  }).from(publishingJobs)
    .where(and(eq(publishingJobs.userOpenId,userOpenId),eq(publishingJobs.status,"versand_ungeklaert")))
    .orderBy(desc(publishingJobs.updatedAt)).limit(Math.min(Math.max(limit,1),100));
}

export async function listPublishingReviewHistory(
  db: PublishingDb,
  userOpenId: string,
) {
  return db.select({
    id: publishingReviewEvents.id,
    jobId: publishingReviewEvents.jobId,
    resolution: publishingReviewEvents.resolution,
    externalId: publishingReviewEvents.externalId,
    evidence: publishingReviewEvents.evidence,
    actorOpenId: publishingReviewEvents.actorOpenId,
    reviewedAt: publishingReviewEvents.reviewedAt,
  }).from(publishingReviewEvents)
    .where(eq(publishingReviewEvents.userOpenId,userOpenId))
    .orderBy(desc(publishingReviewEvents.reviewedAt))
    .limit(12);
}

export async function reconcileUncertainPublishingJob(
  db: PublishingDb,
  ownerOpenId: string,
  actorOpenId: string,
  jobId: number,
  decision: PublishingReviewDecision,
  now = new Date(),
): Promise<boolean> {
  validatePublishingReview(decision);
  if (!actorOpenId || !ownerOpenId || !Number.isSafeInteger(jobId) || jobId < 1)
    throw new Error("Ungültige Identität oder Job-ID.");
  return db.transaction(async tx => {
    // Strict CAS: concurrent reviewers and the publishing autopilot cannot
    // both transition one uncertain job. Never requeue automatically.
    const [changed] = await tx.update(publishingJobs).set(decision.resolution === "confirmed_published"
      ? {
          status: "veroeffentlicht" as const,
          mode: "live",
          externalId: decision.externalId.trim(),
          publishedAt: now, // recognition time; original remote time unknown
          lastError: null,
          updatedAt: now,
        }
      : {
          status: "abgebrochen" as const,
          lastError: "Manuell geprüft und ohne erneute Veröffentlichung abgeschlossen.",
          updatedAt: now,
        })
      .where(and(
        eq(publishingJobs.id,jobId),
        eq(publishingJobs.userOpenId,ownerOpenId),
        eq(publishingJobs.status,"versand_ungeklaert"),
      )).returning({id:publishingJobs.id});
    if (!changed) return false;
    await tx.insert(publishingReviewEvents).values({
      jobId,
      userOpenId: ownerOpenId,
      actorOpenId,
      resolution: decision.resolution,
      externalId: decision.resolution === "confirmed_published" ? decision.externalId.trim() : null,
      evidence: decision.evidence.trim(),
      reviewedAt: now,
    });
    return true;
  });
}

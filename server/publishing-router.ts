/**
 * Sprint 365 — Publishing-Router: Kampagnen einreihen, Status, Abbruch,
 * Retry und Autopilot-Uebersicht. Nutzer-gescoped via ctx.user.openId.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { listUncertainPublishingForAdmin, listPublishingReviewHistory, reconcileUncertainPublishingJob } from "./publishing-review";
import {
  cancelPublishingJob,
  setPublishingJobAssets,
  setPublishingJobAsset,
  enqueueCampaignForUser,
  getPublishingModeOverview,
  listPublishingJobsForUser,
  retryFailedPublishingJobs,
} from "./publishing-service";

export const publishingRouter = router({
  /** Admin can inspect only their OWN uncertain jobs (never cross-tenant). */
  reviewQueue: adminProcedure.query(async ({ctx}) => {
    const db=await getDb();
    if (!db) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Datenbank nicht verfügbar."});
    const [jobs,events]=await Promise.all([
      listUncertainPublishingForAdmin(db,ctx.user.openId),
      listPublishingReviewHistory(db,ctx.user.openId),
    ]);
    return {
      jobs: jobs.map(job => ({...job,updatedAt:job.updatedAt.toISOString(),scheduledFor:job.scheduledFor.toISOString()})),
      events: events.map(event => ({...event,reviewedAt:event.reviewedAt.toISOString()})),
    };
  }),
  /**
   * Explicit human review only, never resend. The two exact confirmation
   * tokens prevent accidental execution by an unconfirmed UI click.
   */
  reconcile: adminProcedure.input(z.discriminatedUnion("resolution", [
    z.object({
      jobId:z.number().int().positive(),
      resolution:z.literal("confirmed_published"),
      externalId:z.string().trim().min(4).max(300),
      evidence:z.string().trim().min(16).max(1200),
      confirmation:z.literal("VEROEFFENTLICHUNG_VERIFIZIERT"),
    }),
    z.object({
      jobId:z.number().int().positive(),
      resolution:z.literal("closed_without_replay"),
      evidence:z.string().trim().min(16).max(1200),
      confirmation:z.literal("OHNE_WIEDERHOLUNG_SCHLIESSEN"),
    }),
  ])).mutation(async ({ctx,input}) => {
    const db=await getDb();
    if (!db) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Datenbank nicht verfügbar."});
    const changed=await reconcileUncertainPublishingJob(db,ctx.user.openId,ctx.user.openId,input.jobId,input);
    if (!changed) throw new TRPCError({code:"CONFLICT",message:"Der Job wurde bereits bearbeitet oder gehört nicht zu Ihrem Konto."});
    return {reviewed:true};
  }),

  enqueueCampaign: protectedProcedure
    .input(
      z.object({
        product: z.string().trim().min(3).max(500),
        goal: z.enum(["aufmerksamkeit", "wachstum", "umsatz"]),
        days: z.number().int().min(1).max(30).optional(),
        assetUrl: z.string().url().max(1000).optional(),
        assetUrls: z.array(z.string().url().max(1000)).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await enqueueCampaignForUser(ctx.user.openId, {
        product: input.product,
        goal: input.goal,
        days: input.days,
        assetUrl: input.assetUrl,
        assetUrls: input.assetUrls,
      });
      return {
        planned: result.planned,
        inserted: result.inserted,
        skipped: result.planned - result.inserted,
        focusPersona: result.focusPersona,
        firstSlotAt: result.firstSlotAt.toISOString(),
        autopilot: "aktiv — faellige Jobs werden im 60-Sekunden-Takt verarbeitet.",
      };
    }),

  status: protectedProcedure
    .input(z.object({ statuses: z.array(z.string()).optional(), limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const jobs = await listPublishingJobsForUser(ctx.user.openId, {
        statuses: input.statuses,
        limit: input.limit,
      });
      const modes = getPublishingModeOverview();
      return {
        jobs: jobs.map((job) => ({
          id: job.id,
          persona: job.persona,
          platform: job.platform,
          campaignDay: job.campaignDay,
          status: job.status,
          requiresManualReview: job.status === "versand_ungeklaert",
          mode: job.mode,
          scheduledFor: job.scheduledFor.toISOString(),
          publishedAt: job.publishedAt?.toISOString() ?? null,
          lastError: job.lastError,
          product: job.product,
        })),
        modes,
      };
    }),

  setAsset: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive(), assetUrl: z.string().url().max(1000) }))
    .mutation(async ({ ctx, input }) => ({ updated: await setPublishingJobAsset(ctx.user.openId, input.jobId, input.assetUrl) })),

  setAssets: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive(), assetUrls: z.array(z.string().url().max(1000)).min(2).max(10) }))
    .mutation(async ({ ctx, input }) => ({ updated: await setPublishingJobAssets(ctx.user.openId, input.jobId, input.assetUrls) })),

  cancel: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => ({ cancelled: await cancelPublishingJob(ctx.user.openId, input.jobId) })),

  retryFailed: protectedProcedure.mutation(async ({ ctx }) => ({
    requeued: await retryFailedPublishingJobs(ctx.user.openId),
  })),
});

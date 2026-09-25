/**
 * Sprint 365 — Publishing-Router: Kampagnen einreihen, Status, Abbruch,
 * Retry und Autopilot-Uebersicht. Nutzer-gescoped via ctx.user.openId.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  cancelPublishingJob,
  enqueueCampaignForUser,
  getPublishingModeOverview,
  listPublishingJobsForUser,
  retryFailedPublishingJobs,
} from "./publishing-service";

export const publishingRouter = router({
  enqueueCampaign: protectedProcedure
    .input(
      z.object({
        product: z.string().trim().min(3).max(500),
        goal: z.enum(["aufmerksamkeit", "wachstum", "umsatz"]),
        days: z.number().int().min(1).max(30).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await enqueueCampaignForUser(ctx.user.openId, {
        product: input.product,
        goal: input.goal,
        days: input.days,
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
          mode: job.mode,
          scheduledFor: job.scheduledFor.toISOString(),
          publishedAt: job.publishedAt?.toISOString() ?? null,
          lastError: job.lastError,
          product: job.product,
        })),
        modes,
      };
    }),

  cancel: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => ({ cancelled: await cancelPublishingJob(ctx.user.openId, input.jobId) })),

  retryFailed: protectedProcedure.mutation(async ({ ctx }) => ({
    requeued: await retryFailedPublishingJobs(ctx.user.openId),
  })),
});

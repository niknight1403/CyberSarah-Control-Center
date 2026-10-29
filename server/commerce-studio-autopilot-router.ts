/** Admin-only Commerce Studio APIs. Never performs external publishing or pricing writes. */
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  commerceStudioOverview, createCommerceBundleDraft,
  createPriceExperimentDraft, runCommerceStudioCycle, importStripeProductDrafts,
} from "./commerce-studio-autopilot";

export const commerceStudioAutopilotRouter = router({
  overview: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(({ input }) => commerceStudioOverview(input?.days ?? 30)),
  createBundle: adminProcedure.input(z.object({
    offerId: z.number().int().positive(),
    audience: z.string().trim().min(3).max(200).default("deutschsprachige Zielgruppe"),
  })).mutation(({ input }) => createCommerceBundleDraft(input.offerId, input.audience)),
  proposePriceTest: adminProcedure.input(z.object({
    offerId: z.number().int().positive(),
  })).mutation(({ input }) => createPriceExperimentDraft(input.offerId)),
  importStripe: adminProcedure.mutation(() => importStripeProductDrafts()),
  runNow: adminProcedure.input(z.object({
    maxOffers: z.number().int().min(1).max(3).default(2),
  }).optional()).mutation(({ input }) => runCommerceStudioCycle(input?.maxOffers ?? 2)),
});

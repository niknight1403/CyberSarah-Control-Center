import { z } from "zod";
import {
  auditContentQuality,
  decideWeeklyOptimization,
  revenueScenario,
} from "../lib/faceless-channel-logic";
import { facelessChannelOverview, materializeFacelessChannelLaunch } from "./faceless-channel-service";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";

const weekly=z.object({
  impressions:z.number().int().min(0),
  views:z.number().int().min(0),
  ctrPct:z.number().min(0).max(100).nullable(),
  averageViewSeconds:z.number().min(0).nullable(),
  averageVideoSeconds:z.number().min(0).nullable(),
  returningViewers:z.number().int().min(0).nullable(),
  qualifiedClicks:z.number().int().min(0),
  emailSignups:z.number().int().min(0),
  confirmedRevenueCents:z.number().int().min(0),
});

export const facelessChannelRouter=router({
  overview:protectedProcedure.query(()=>facelessChannelOverview()),

  /** Safe autonomous preparation: creates pending drafts only. */
  materializeLaunch:adminProcedure.mutation(()=>materializeFacelessChannelLaunch()),

  audit:protectedProcedure.input(z.object({
    scriptWords:z.number().int().min(0),
    originalExample:z.boolean(),
    sourceCount:z.number().int().min(0),
    hasHumanGate:z.boolean(),
    assetLicensesDocumented:z.boolean(),
    claimsVerified:z.boolean(),
    ctaMatchesProblem:z.boolean(),
  })).mutation(({input})=>auditContentQuality(input)),

  optimizeWeek:protectedProcedure.input(z.object({
    current:weekly,
    history:z.array(weekly).max(52).default([]),
  })).mutation(({input})=>decideWeeklyOptimization(input.current,input.history)),

  scenario:protectedProcedure.input(z.object({
    monthlyLongformViews:z.number().int().min(0),
    ctaClickPct:z.number().min(0).max(100),
    landingConversionPct:z.number().min(0).max(100),
    affiliateClicksPerLead:z.number().min(0).max(10),
    paidConversionPct:z.number().min(0).max(100),
    assumedAffiliateValueCents:z.number().int().min(0),
    digitalProductBuyerPct:z.number().min(0).max(100),
    digitalProductPriceCents:z.number().int().min(0),
    yppRpmCents:z.number().int().min(0).nullable().optional(),
    yppEligible:z.boolean(),
  })).mutation(({input})=>revenueScenario(input)),
});

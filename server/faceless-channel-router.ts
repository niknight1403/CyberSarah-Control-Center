import { z } from "zod";
import {
  auditContentQuality,
  decideWeeklyOptimization,
  revenueScenario,
} from "../lib/faceless-channel-logic";
import { facelessChannelOverview, materializeFacelessChannelLaunch } from "./faceless-channel-service";
import { channelAutopilotOverview, runChannelAutopilot } from "./channel-autopilot";
import { FACELESS_MULTI_CHANNEL_SYSTEM_PROMPT, auditCrossChannelReuse, multiChannelStrategy, rankChannelPortfolio } from "../lib/faceless-multichannel-logic";
import { materializeProductionSystem, planChannelExpansion } from "./faceless-multichannel-service";
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
  autopilot:adminProcedure.query(()=>channelAutopilotOverview()),
  runAutopilot:adminProcedure.mutation(()=>runChannelAutopilot()),


  architectPrompt:adminProcedure.query(()=>({prompt:FACELESS_MULTI_CHANNEL_SYSTEM_PROMPT})),
  multiChannelStrategy:protectedProcedure.input(z.object({
    script:z.number().min(0).max(100),voice:z.number().min(0).max(100),visuals:z.number().min(0).max(100),edit:z.number().min(0).max(100),
    qualityScore:z.number().min(0).max(100),publishedProofs:z.number().int().min(0),reuseRisk:z.number().min(0).max(100),
  })).query(({input})=>multiChannelStrategy(input)),
  materializeProductionSystem:adminProcedure.mutation(()=>materializeProductionSystem()),
  planExpansion:adminProcedure.input(z.object({
    script:z.number().min(0).max(100),voice:z.number().min(0).max(100),visuals:z.number().min(0).max(100),edit:z.number().min(0).max(100),
    qualityScore:z.number().min(0).max(100),publishedProofs:z.number().int().min(0),reuseRisk:z.number().min(0).max(100),
  })).mutation(({input})=>planChannelExpansion(input)),
  auditCrossChannelReuse:protectedProcedure.input(z.object({
    a:z.object({channelKey:z.string().min(1),hookPattern:z.string(),voiceStyle:z.string(),visualGrammar:z.string(),ctaStyle:z.string(),exampleDomain:z.string()}),
    b:z.object({channelKey:z.string().min(1),hookPattern:z.string(),voiceStyle:z.string(),visualGrammar:z.string(),ctaStyle:z.string(),exampleDomain:z.string()}),
  })).mutation(({input})=>auditCrossChannelReuse(input.a,input.b)),
  rankPortfolio:adminProcedure.input(z.array(z.object({
    key:z.string().min(1),qualifiedViews:z.number().int().min(0),leads:z.number().int().min(0),confirmedRevenueCents:z.number().int().min(0),
    variableCostCents:z.number().int().min(0),productionHours:z.number().min(0),qualityScore:z.number().min(0).max(100),reuseRisk:z.number().min(0).max(100),
  })).max(50)).mutation(({input})=>rankChannelPortfolio(input)),

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

import {z} from "zod";
import {adminProcedure,router} from "./_core/trpc";
import {hubspotContacts,hubspotDeals,firecrawlPreview,draftWeeklyMarketing,revenueKpis} from "./revenue-connectors";
import {nextWeeklyDraft, nextOutreachWindow, auditedRevenueKpis,
  summarizeMeterQueue, reconcileMeterEvents, nextHubSpotCursor,
  maySendOutreach, isSuppressed} from "./revenue-sprint-primitives";

import {getRevenueMeterHealth} from "./revenue-meter-health";

export const revenueIntegrationsRouter=router({
  meterQueueHealth:adminProcedure.query(()=>getRevenueMeterHealth()),
  safetyStatus:adminProcedure.query(()=>({
    billingEnabled:false, outboundEnabled:false, weeklyPublishingEnabled:false,
    meteredLedgerRequiresMigration:true, liveKpisConnected:false,
    note:"Read-only planning routes; no dispatch or charge occurs.",
  })),
  schedulePreview:adminProcedure.input(z.object({
    now:z.string().datetime({offset:true}),
    weekdayUtc:z.number().int().min(0).max(6).default(1),
    hourUtc:z.number().int().min(0).max(23).default(9),
  })).query(({input})=>nextWeeklyDraft(new Date(input.now),input.weekdayUtc,input.hourUtc)),
  outreachWindowPreview:adminProcedure.input(z.object({
    now:z.string().datetime({offset:true}),
    hourUtc:z.number().int().min(0).max(23).default(10),
  })).query(({input})=>({nextEligibleAt:nextOutreachWindow(new Date(input.now),input.hourUtc),willSend:false})),
  outreachPolicyPreview:adminProcedure.input(z.object({
    approved:z.boolean(), consentRecorded:z.boolean(), unsubscribed:z.boolean(),
    domainVerified:z.boolean(), recipient:z.string().email(),
    suppressedAddresses:z.array(z.string().email()).max(100),
  })).query(({input})=>{
    const allowed=maySendOutreach(input)&&
      !isSuppressed(input.recipient,new Set(input.suppressedAddresses.map(s=>s.toLowerCase())));
    return {allowedBySuppliedPolicy:allowed,willSend:false,
      warning:"Preview only; persisted consent and suppression evidence is not verified."};
  }),
  crmPaginationPreview:adminProcedure.input(z.object({
    nextAfter:z.string().min(1).max(256).nullable(),
    previouslySeen:z.array(z.string()).max(1000),
  })).query(({input})=>({
    nextCursor:nextHubSpotCursor(input.nextAfter?{paging:{next:{after:input.nextAfter}}}:{},
      new Set(input.previouslySeen))
  })),
  meterQueuePreview:adminProcedure.input(z.object({
    rows:z.array(z.object({state:z.enum(["pending","processing","sent","failed"]),
      attempts:z.number().int().nonnegative()})).max(1000),
    sentIds:z.array(z.string()).max(1000),
    providerIds:z.array(z.string()).max(1000),
  })).query(({input})=>({
    counts:summarizeMeterQueue(input.rows),
    reconciliation:reconcileMeterEvents(input.sentIds,input.providerIds),
    source:"supplied_preview_only" as const,
  })),
  attributedMetricsPreview:adminProcedure.input(z.object({
    subscriptionMonthlyCents:z.array(z.number().int().nonnegative()).max(1000),
    leads:z.number().int().nonnegative(),customers:z.number().int().nonnegative(),
    apiEvents:z.number().int().nonnegative(),source:z.string().min(1).max(120),
    asOf:z.string().datetime({offset:true}),
  })).query(({input})=>auditedRevenueKpis(input)),

  readiness:adminProcedure.query(()=>({
    hubspot:Boolean(process.env.HUBSPOT_ACCESS_TOKEN),
    firecrawl:Boolean(process.env.FIRECRAWL_API_KEY),
    resend:Boolean(process.env.RESEND_API_KEY),
    stripeMetered:Boolean(process.env.STRIPE_SECRET_KEY),
    outboundSendingEnabled:false,automaticBillingEnabled:false,
  })),
  crmPreview:adminProcedure.input(z.object({kind:z.enum(["contacts","deals"]),limit:z.number().int().min(1).max(50).default(20)}))
    .query(({input})=>input.kind==="contacts"?hubspotContacts(process.env.HUBSPOT_ACCESS_TOKEN??"",input.limit):
      hubspotDeals(process.env.HUBSPOT_ACCESS_TOKEN??"",input.limit)),
  sitePreview:adminProcedure.input(z.object({url:z.string().url().max(1200)}))
    .mutation(({input})=>firecrawlPreview(process.env.FIRECRAWL_API_KEY??"",input.url)),
  weeklyDraft:adminProcedure.input(z.object({
    product:z.string().min(2).max(120),feature:z.string().min(8).max(500),
    result:z.string().min(8).max(500),link:z.string().url().max(1200),
  })).mutation(({input})=>draftWeeklyMarketing(input)),
  metricsPreview:adminProcedure.input(z.object({
    activeSubscriptionCents:z.array(z.number().int().nonnegative()).max(1000),
    leads:z.number().int().nonnegative(),conversions:z.number().int().nonnegative(),
    apiCalls:z.number().int().nonnegative(),
  })).query(({input})=>({...revenueKpis(input),source:"supplied_preview_only" as const})),
});

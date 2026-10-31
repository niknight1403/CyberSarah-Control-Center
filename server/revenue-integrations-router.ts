import {z} from "zod";
import {adminProcedure,router} from "./_core/trpc";
import {hubspotContacts,hubspotDeals,firecrawlPreview,draftWeeklyMarketing,revenueKpis} from "./revenue-connectors";
export const revenueIntegrationsRouter=router({
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

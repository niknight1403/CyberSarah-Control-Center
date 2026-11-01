import {z} from "zod";
import {adminProcedure,router} from "./_core/trpc";
import { createHubspotModule, describeHubspotEnv } from "./integrations/hubspot";
import {hubspotContacts,hubspotDeals,firecrawlPreview,draftWeeklyMarketing,revenueKpis} from "./revenue-connectors";
import {loadHubspotMrrSnapshot} from "./hubspot-mrr";
import {
  CONNECTOR_CATALOG, buildHubspotSyncPlan, buildLeadScrapePlan, buildMeteredUsageEvent,
  buildOutreachDispatchPlan, evaluateConnectorReadiness, summarizeConnectorReadiness,
  resolveHubspotToken,
} from "../lib/revenue-connectors-logic";
import {
  ACCOUNT_PROVIDERS, buildSetupGuide, createAccountEntry, nextAccountStep, reviewAccountConfiguration,
} from "../lib/account-agent-logic";
import { buildMetricsSnapshot, formatCents } from "../lib/revenue-metrics-logic";
import { approveDraft, buildContentDraft, nextWeeklyRun } from "../lib/content-distribution-logic";
import {getRevenueMeterHealth} from "./revenue-meter-health";
import {nextWeeklyDraft,nextOutreachWindow,auditedRevenueKpis,
  summarizeMeterQueue,reconcileMeterEvents,nextHubSpotCursor,
  maySendOutreach,isSuppressed} from "./revenue-sprint-primitives";

export const revenueIntegrationsRouter=router({
  safetyStatus:adminProcedure.query(()=>({
    billingEnabled:false,outboundEnabled:false,weeklyPublishingEnabled:false,
    meteredLedgerRequiresMigration:true,liveKpisConnected:false,
    note:"Revenue safety controls are read-only unless an explicit production path is enabled.",
  })),
  meterQueueHealth:adminProcedure.query(()=>getRevenueMeterHealth()),
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
    approved:z.boolean(),consentRecorded:z.boolean(),unsubscribed:z.boolean(),
    domainVerified:z.boolean(),recipient:z.string().email(),
    suppressedAddresses:z.array(z.string().email()).max(100),
  })).query(({input})=>{
    const allowed=maySendOutreach(input)&&
      !isSuppressed(input.recipient,new Set(input.suppressedAddresses.map(s=>s.toLowerCase())));
    return {allowedBySuppliedPolicy:allowed,willSend:false,
      warning:"Preview only; durable consent and suppression evidence must be verified before sending."};
  }),
  crmPaginationPreview:adminProcedure.input(z.object({
    nextAfter:z.string().min(1).max(256).nullable(),
    previouslySeen:z.array(z.string()).max(1000),
  })).query(({input})=>({
    nextCursor:nextHubSpotCursor(input.nextAfter?{paging:{next:{after:input.nextAfter}}}:{},
      new Set(input.previouslySeen)),
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
    hubspot:Boolean(resolveHubspotToken()),
    firecrawl:Boolean(process.env.FIRECRAWL_API_KEY),
    resend:Boolean(process.env.RESEND_API_KEY),
    stripeMetered:Boolean(process.env.STRIPE_SECRET_KEY),
    outboundSendingEnabled:false,automaticBillingEnabled:false,
  })),
  crmPreview:adminProcedure.input(z.object({kind:z.enum(["contacts","deals"]),limit:z.number().int().min(1).max(50).default(20)}))
    .query(({input})=>input.kind==="contacts"?hubspotContacts(resolveHubspotToken(),input.limit):
      hubspotDeals(resolveHubspotToken(),input.limit)),
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

  /* ---- Umsatz: MRR aus echten HubSpot-Deals und Ownern ---- */
  hubspotMrr:adminProcedure.input(z.object({
    months:z.number().int().min(1).max(24).default(6),
    windowDays:z.number().int().min(1).max(365).default(30),
  }).optional()).query(async({input})=>{
    const result=await loadHubspotMrrSnapshot(process.env,{
      months:input?.months??6,windowDays:input?.windowDays??30,
    });
    return result.ok
      ? {ok:true as const,snapshot:result.snapshot,warnings:result.warnings}
      : {ok:false as const,reason:result.reason,code:result.code};
  }),

  /* ---- Konto-Agent: Konten anlegen und einstellen (Metadaten, keine Fremd-Registrierung) ---- */
  accountProviders:adminProcedure.query(()=>({
    providers:ACCOUNT_PROVIDERS,
    setup:ACCOUNT_PROVIDERS.map(p=>buildSetupGuide(p.key)),
  })),
  accountCreate:adminProcedure.input(z.object({provider:z.string().max(40),label:z.string().max(80).optional()}))
    .mutation(({input})=>{
      const result=createAccountEntry(input);
      if(!result.ok)return {ok:false as const,reason:result.reason};
      return {ok:true as const,account:result.value,nextStep:nextAccountStep(result.value)};
    }),
  accountReview:adminProcedure.input(z.object({provider:z.string().max(40)}))
    .query(({input})=>reviewAccountConfiguration(input.provider)),
  accountTemplate:adminProcedure.input(z.object({provider:z.string().max(40)}))
    .query(({input})=>buildSetupGuide(input.provider)),

  /* ---- Verbindungen: sauberer Status und sichere Vorschauen ---- */
  connectorCatalog:adminProcedure.query(()=>({catalog:CONNECTOR_CATALOG,readiness:summarizeConnectorReadiness()})),
  connectorReadiness:adminProcedure.input(z.object({key:z.enum(["hubspot","firecrawl","outreach","stripe_metered","apollo"])}))
    .query(({input})=>evaluateConnectorReadiness(input.key)),
  crmSyncPlan:adminProcedure.input(z.object({
    contacts:z.number().int().min(0).max(10_000),deals:z.number().int().min(0).max(10_000),
    direction:z.enum(["pull","push","both"]).optional(),
  })).mutation(({input})=>buildHubspotSyncPlan(input)),
  scrapeGuard:adminProcedure.input(z.object({url:z.string().max(2048)}))
    .mutation(({input})=>buildLeadScrapePlan(input.url)),
  outreachPlan:adminProcedure.input(z.object({candidates:z.array(z.object({
    email:z.string().max(320),companyDomain:z.string().max(253).default(""),
    consentGiven:z.boolean(),suppressed:z.boolean().optional(),
  })).max(500)})).mutation(({input})=>buildOutreachDispatchPlan(input.candidates)),
  meteredEventPlan:adminProcedure.input(z.object({
    customerId:z.string().max(64),meterEventName:z.string().max(120).optional(),
    quantity:z.number(),occurredAt:z.string().datetime().optional(),
  })).mutation(({input})=>buildMeteredUsageEvent({customerId:input.customerId,
    meterEventName:input.meterEventName??process.env.STRIPE_METER_EVENT_NAME??"",quantity:input.quantity,
    occurredAt:input.occurredAt?new Date(input.occurredAt):undefined})),

  /* ---- Kennzahlen und Inhalte ---- */
  mrrSnapshot:adminProcedure.input(z.object({
    subscriptions:z.array(z.object({customerId:z.string().max(64),status:z.enum(["active","trialing","past_due","canceled"]),
      amountCents:z.number().int().min(0),interval:z.enum(["month","year"])})).max(5000).default([]),
    funnel:z.object({visitors:z.number().int().min(0),signups:z.number().int().min(0),paidCustomers:z.number().int().min(0)})
      .default({visitors:0,signups:0,paidCustomers:0}),
    usage:z.array(z.object({customerId:z.string().max(64),calls:z.number().int().min(0),occurredAt:z.string()})).max(20000).default([]),
  }).default({subscriptions:[],funnel:{visitors:0,signups:0,paidCustomers:0},usage:[]})).query(({input})=>{
    const snapshot=buildMetricsSnapshot(input);
    return {...snapshot,mrrFormatted:formatCents(snapshot.mrrCents),arrFormatted:formatCents(snapshot.arrCents)};
  }),
  contentDraftAuto:adminProcedure.input(z.object({
    kind:z.enum(["case_study","release_notes"]),customer:z.string().max(120).optional(),metric:z.string().max(160).optional(),
    improvement:z.string().max(160).optional(),features:z.array(z.string().max(160)).max(20).optional(),version:z.string().max(40).optional(),
  })).mutation(({input})=>buildContentDraft(input)),
  contentApprove:adminProcedure.input(z.object({
    title:z.string().max(160),body:z.string().max(8000),channels:z.array(z.string()).max(8),
    publishAt:z.string().datetime(),approvedBy:z.string().min(1).max(120),
  })).mutation(({input})=>{
    const draft=approveDraft({kind:"release_notes",title:input.title,body:input.body,channels:input.channels,
      requiresApproval:true,publishAt:null},input.approvedBy,new Date(input.publishAt));
    return draft?{ok:true as const,draft}:{ok:false as const,reason:"freigabe-ungueltig"};
  }),
  contentSchedule:adminProcedure.query(()=>({nextContentRun:nextWeeklyRun().toISOString()})),
  /* --- HubSpot-Modul (Contacts, Companies, Deals, Search) --------------- */
  hubspotModuleStatus:adminProcedure.query(()=>({
    ...describeHubspotEnv(),
    mode:createHubspotModule().mode,
    endpoints:["/crm/v3/objects/contacts","/crm/v3/objects/companies","/crm/v3/objects/deals","/crm/v3/objects/{type}/search"],
  })),
  hubspotCreateContact:adminProcedure.input(z.object({
    email:z.string().email().max(320),firstname:z.string().max(120).optional(),
    lastname:z.string().max(120).optional(),phone:z.string().max(60).optional(),
    lifecyclestage:z.string().max(60).optional(),
  })).mutation(async({input})=>{
    const {service,mode}=createHubspotModule();
    return {mode,contact:await service.createContact(input)};
  }),
  hubspotUpsertCompany:adminProcedure.input(z.object({
    name:z.string().min(1).max(200),domain:z.string().max(200).optional(),
    industry:z.string().max(120).optional(),city:z.string().max(120).optional(),
  })).mutation(async({input})=>{
    const {service,mode}=createHubspotModule();
    const result=await service.upsertCompany(input);
    return {mode,...result};
  }),
  hubspotCreateDeal:adminProcedure.input(z.object({
    dealname:z.string().min(1).max(200),dealstage:z.string().min(1).max(80),
    amount:z.number().nonnegative().optional(),pipeline:z.string().max(80).optional(),
    closedate:z.string().max(40).optional(),contactId:z.string().max(80).optional(),
  })).mutation(async({input})=>{
    const {service,mode}=createHubspotModule();
    return {mode,deal:await service.createDeal(input)};
  }),
  hubspotSearch:adminProcedure.input(z.object({
    objectType:z.enum(["contacts","companies","deals"]),
    filters:z.array(z.object({
      propertyName:z.string().min(1).max(120),
      operator:z.enum(["EQ","NEQ","CONTAINS_TOKEN","GT","GTE","LT","LTE","HAS_PROPERTY"]),
      value:z.string().max(320).optional(),
    })).max(8),
    properties:z.array(z.string().max(120)).max(20).optional(),
    limit:z.number().int().min(1).max(100).optional(),
  })).query(async({input})=>{
    const {service,mode}=createHubspotModule();
    return {mode,...await service.search(input)};
  }),
});

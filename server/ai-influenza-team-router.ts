import {TRPCError} from "@trpc/server";
import {z} from "zod";
import {
  AI_INFLUENZA_AGENTS,
  AI_INFLUENZA_ENTRY_PACKAGE_ID,
  AI_INFLUENZA_HIDDEN_PACKAGE_IDS,
  AI_INFLUENZA_PACKAGE_IDS,
  AI_INFLUENZA_PACKAGES,
  aiInfluenzaBookingBlockReason,
  simulateAiInfluenzaTestJourney,
} from "../lib/ai-influenza-team-logic";
import {
  createAiInfluenzaInboundOrder,
  createAiInfluenzaOrder,
  ensureAiInfluenzaCustomerNode,
  aiInfluenzaTeamOverview,
  advanceAiInfluenzaOrder,
} from "./ai-influenza-team-service";
import {
  createAiInfluenzaGuestCheckoutSession,
  createAiInfluenzaPackageCheckoutSession,
  createLiveBillingPortalSession,
} from "./billing";
import {adminProcedure,protectedProcedure,publicProcedure,router} from "./_core/trpc";
import {aiInfluenzaLeadPipeline,prepareAiInfluenzaProposal,upsertAiInfluenzaLead} from "./ai-influenza-lead-service";
import {aiInfluenzaDeliveryPlan,aiInfluenzaDeliveryStatus,aiInfluenzaOrderLaunchReadiness,generateAiInfluenzaTaskDraft} from "./ai-influenza-delivery-service";
import {aiInfluenzaCustomerReport,aiInfluenzaProfitOverview,recordAiInfluenzaCost} from "./ai-influenza-profit-service";
import {createAiInfluenzaIntroRequest,listAiInfluenzaIntroRequests,markAiInfluenzaIntroRequestHandled} from "./ai-influenza-intro-request-service";

const packageId=z.enum(AI_INFLUENZA_PACKAGE_IDS);

export const aiInfluenzaTeamRouter=router({
  catalog:publicProcedure.query(()=>({
    businessUnit:"AI Influenza Team",
    packages:Object.values(AI_INFLUENZA_PACKAGES),
    pricingNotice:"Startpreise sind Hypothesen; keine Umsatzgarantie.",
  })),
  // Oeffentliche Erstgespraech-Anfrage: Kontaktwunsch der anfragenden Person.
  // Kein Versand, kein Auftrag, keine Zahlung - nur ein Eintrag in der Lead-Pipeline.
  introRequest:publicProcedure.input(z.object({
    name:z.string().trim().min(2).max(120),
    email:z.string().trim().email().max(254),
    company:z.string().trim().max(220).optional(),
    domain:z.string().trim().max(255).optional(),
    packageId:z.enum(["starter","growth","business","elite","unsure"]).optional(),
    goal:z.string().trim().max(1200).optional(),
    preferredWindow:z.enum(["diese-woche","naechste-woche","flexibel"]).optional(),
    consent:z.boolean(),
    website:z.string().max(200).optional(),
  })).mutation(async({input})=>{
    try{return await createAiInfluenzaIntroRequest(input);}
    catch(error){throw new TRPCError({code:"PRECONDITION_FAILED",message:error instanceof Error?error.message:"Anfrage konnte nicht gespeichert werden."});}
  }),
  introRequests:adminProcedure.input(z.object({limit:z.number().int().min(1).max(200).default(50)}).optional())
    .query(({input})=>listAiInfluenzaIntroRequests(input?.limit??50)),
  markIntroRequestHandled:adminProcedure.input(z.object({
    requestId:z.string().trim().min(1).max(20),
    handled:z.boolean().default(true),
  })).mutation(({ctx,input})=>markAiInfluenzaIntroRequestHandled({...input,actorOpenId:ctx.user.openId})),
  agents:adminProcedure.query(()=>AI_INFLUENZA_AGENTS),
  adminEliteAccess:adminProcedure.query(({ctx})=>({
    packageId:"elite" as const,enabled:true as const,
    openId:ctx.user.openId,paymentRequired:false as const,
    paymentStatus:"test-only" as const,recognizedRevenueCents:0 as const,
    externalActionsRequireApproval:true as const,
  })),
  overview:adminProcedure.query(()=>aiInfluenzaTeamOverview()),
  testJourney:adminProcedure.input(z.object({packageId})).query(({input})=>simulateAiInfluenzaTestJourney(input.packageId)),
  checkout:protectedProcedure.input(z.object({packageId})).mutation(async({ctx,input})=>{
    // Sperre auch serverseitig: ein in der UI verstecktes Paket bleibt sonst per API buchbar.
    const blockReason=aiInfluenzaBookingBlockReason(input.packageId);
    if(blockReason)throw new TRPCError({code:"PRECONDITION_FAILED",message:blockReason});
    try{
      const customer=await ensureAiInfluenzaCustomerNode({
        openId:ctx.user.openId,
        name:ctx.user.name,
        email:ctx.user.email,
        packageId:input.packageId,
      });
      const order=await createAiInfluenzaInboundOrder({
        customerNodeKey:customer.nodeKey,
        packageId:input.packageId,
        createdByOpenId:ctx.user.openId,
      });
      const checkout=await createAiInfluenzaPackageCheckoutSession({
        id:ctx.user.id,
        email:ctx.user.email,
        name:ctx.user.name,
        stripeCustomerId:ctx.user.stripeCustomerId,
        role:ctx.user.role,
      },input.packageId,order.payload.orderId);
      return checkout;
    }catch(error){
      throw new TRPCError({code:"PRECONDITION_FAILED",message:error instanceof Error?error.message:"Checkout konnte nicht vorbereitet werden."});
    }
  }),
  /**
   * Gast-Checkout: buchbar ohne Konto.
   *
   * Die Order entsteht erst im Webhook, weil erst dann die von Stripe erhobene
   * Adresse bekannt ist. Hier wird nur eine Referenz erzeugt, damit sich Session
   * und spaeterer Auftrag zuordnen lassen.
   */
  guestCheckout:publicProcedure.input(z.object({
    packageId:z.enum(AI_INFLUENZA_PACKAGE_IDS),
    email:z.string().trim().email().max(200).optional(),
  })).mutation(async({input})=>{
    const blockReason=aiInfluenzaBookingBlockReason(input.packageId);
    if(blockReason)throw new TRPCError({code:"PRECONDITION_FAILED",message:blockReason});
    const orderReference=`guest-checkout-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try{
      return await createAiInfluenzaGuestCheckoutSession({
        packageId:input.packageId,
        orderId:orderReference,
        email:input.email??null,
      });
    }catch(error){
      throw new TRPCError({code:"PRECONDITION_FAILED",message:error instanceof Error?error.message:"Gast-Checkout konnte nicht vorbereitet werden."});
    }
  }),
  adminSandboxOrder:adminProcedure.input(z.object({packageId})).mutation(async({ctx,input})=>{
    // Admin-only internal test order. No Stripe session, subscription or paid status.
    // This endpoint deliberately does not enqueue external delivery or publishing.
    const customer=await ensureAiInfluenzaCustomerNode({
      openId:ctx.user.openId,name:ctx.user.name,email:ctx.user.email,
      packageId:input.packageId,
    });
    const order=await createAiInfluenzaOrder({
      customerNodeKey:customer.nodeKey,
      packageId:input.packageId,
      createdByOpenId:ctx.user.openId,
      mode:"assisted",
      testOnly:true,
      monthlyBudgetCents:0,
    });
    return {orderId:order.payload.orderId,packageId:input.packageId,
      paymentStatus:"test-only" as const,realRevenueCents:0,
      note:"Interner Admin-Testauftrag ohne Stripe-Zahlung und ohne reale Umsatzbuchung."};
  }),
  portal:protectedProcedure.mutation(async({ctx})=>{
    try{return await createLiveBillingPortalSession({stripeCustomerId:ctx.user.stripeCustomerId});}
    catch(error){throw new TRPCError({code:"PRECONDITION_FAILED",message:error instanceof Error?error.message:"Kundenportal konnte nicht geöffnet werden."});}
  }),
  profit:adminProcedure.input(z.object({windowDays:z.number().int().min(1).max(365).default(30)}).optional()).query(({input})=>aiInfluenzaProfitOverview(input?.windowDays??30)),
  customerReport:adminProcedure.input(z.object({orderId:z.string().trim().min(4).max(120)})).query(({input})=>aiInfluenzaCustomerReport(input.orderId)),
  recordCost:adminProcedure.input(z.object({
    orderId:z.string().trim().min(4).max(120),
    category:z.enum(["llm","media","delivery","tooling","refund","other"]),
    amountCents:z.number().int().nonnegative(),
    note:z.string().trim().max(300).optional(),
  })).mutation(({ctx,input})=>recordAiInfluenzaCost({...input,actorOpenId:ctx.user.openId})),
  deliveryPlan:adminProcedure.input(z.object({orderId:z.string().trim().min(4).max(120)})).query(({input})=>aiInfluenzaDeliveryPlan(input.orderId)),
  deliveryStatus:adminProcedure.input(z.object({orderId:z.string().trim().min(4).max(120)})).query(({input})=>aiInfluenzaDeliveryStatus(input.orderId)),
  launchReadiness:adminProcedure.input(z.object({orderId:z.string().trim().min(4).max(120)})).query(({input})=>aiInfluenzaOrderLaunchReadiness(input.orderId)),
  generateTaskDraft:adminProcedure.input(z.object({taskJobId:z.number().int().positive()})).mutation(({input})=>generateAiInfluenzaTaskDraft(input.taskJobId)),
  leadPipeline:adminProcedure.query(()=>aiInfluenzaLeadPipeline()),
  upsertLead:adminProcedure.input(z.object({
    companyName:z.string().trim().min(2).max(220),
    domain:z.string().trim().min(3).max(255),
    publicSourceUrl:z.string().url().max(1000),
    contactBasis:z.enum(["customer-requested","existing-customer","consent","legitimate-interest-review","unknown","opted-out"]),
    signals:z.object({
      automationPain:z.number().min(0).max(100),
      contentNeed:z.number().min(0).max(100),
      budgetSignal:z.number().min(0).max(100),
      engagement:z.number().min(0).max(100),
      strategicFit:z.number().min(0).max(100),
    }),
    estimatedValueCents:z.number().int().nonnegative().optional(),
    optedOut:z.boolean().default(false),
  })).mutation(({input})=>upsertAiInfluenzaLead(input)),
  prepareProposal:adminProcedure.input(z.object({
    nodeKey:z.string().trim().min(3).max(180),packageId,
  })).mutation(({ctx,input})=>prepareAiInfluenzaProposal({...input,createdByOpenId:ctx.user.openId})),
  advanceOrder:adminProcedure.input(z.object({
    jobId:z.number().int().positive(),
    approved:z.boolean().default(false),
    estimatedCostCents:z.number().int().nonnegative().default(0),
  })).mutation(({input})=>advanceAiInfluenzaOrder(input)),
});

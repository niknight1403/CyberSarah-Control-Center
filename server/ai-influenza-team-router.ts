import {TRPCError} from "@trpc/server";
import {z} from "zod";
import {
  AI_INFLUENZA_AGENTS,
  AI_INFLUENZA_PACKAGE_IDS,
  AI_INFLUENZA_PACKAGES,
  simulateAiInfluenzaTestJourney,
} from "../lib/ai-influenza-team-logic";
import {
  createAiInfluenzaInboundOrder,
  ensureAiInfluenzaCustomerNode,
  aiInfluenzaTeamOverview,
  advanceAiInfluenzaOrder,
} from "./ai-influenza-team-service";
import {
  createAiInfluenzaPackageCheckoutSession,
  createLiveBillingPortalSession,
} from "./billing";
import {adminProcedure,protectedProcedure,publicProcedure,router} from "./_core/trpc";
import {aiInfluenzaLeadPipeline,prepareAiInfluenzaProposal,upsertAiInfluenzaLead} from "./ai-influenza-lead-service";
import {aiInfluenzaDeliveryPlan,aiInfluenzaDeliveryStatus,generateAiInfluenzaTaskDraft} from "./ai-influenza-delivery-service";
import {aiInfluenzaCustomerReport,aiInfluenzaProfitOverview,recordAiInfluenzaCost} from "./ai-influenza-profit-service";

const packageId=z.enum(AI_INFLUENZA_PACKAGE_IDS);

export const aiInfluenzaTeamRouter=router({
  catalog:publicProcedure.query(()=>({
    businessUnit:"AI Influenza Team",
    packages:Object.values(AI_INFLUENZA_PACKAGES),
    pricingNotice:"Startpreise sind Hypothesen; keine Umsatzgarantie.",
  })),
  agents:adminProcedure.query(()=>AI_INFLUENZA_AGENTS),
  overview:adminProcedure.query(()=>aiInfluenzaTeamOverview()),
  testJourney:adminProcedure.input(z.object({packageId})).query(({input})=>simulateAiInfluenzaTestJourney(input.packageId)),
  checkout:protectedProcedure.input(z.object({packageId})).mutation(async({ctx,input})=>{
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
      return {orderId:order.payload.orderId,...checkout};
    }catch(error){
      throw new TRPCError({code:"PRECONDITION_FAILED",message:error instanceof Error?error.message:"Checkout konnte nicht vorbereitet werden."});
    }
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

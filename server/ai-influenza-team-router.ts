import {TRPCError} from "@trpc/server";
import {z} from "zod";
import {
  AI_INFLUENZA_AGENTS,
  AI_INFLUENZA_PACKAGE_IDS,
  AI_INFLUENZA_PACKAGES,
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

const packageId=z.enum(AI_INFLUENZA_PACKAGE_IDS);

export const aiInfluenzaTeamRouter=router({
  catalog:publicProcedure.query(()=>({
    businessUnit:"AI Influenza Team",
    packages:Object.values(AI_INFLUENZA_PACKAGES),
    pricingNotice:"Startpreise sind Hypothesen; keine Umsatzgarantie.",
  })),
  agents:adminProcedure.query(()=>AI_INFLUENZA_AGENTS),
  overview:adminProcedure.query(()=>aiInfluenzaTeamOverview()),
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
  advanceOrder:adminProcedure.input(z.object({
    jobId:z.number().int().positive(),
    approved:z.boolean().default(false),
    estimatedCostCents:z.number().int().nonnegative().default(0),
  })).mutation(({input})=>advanceAiInfluenzaOrder(input)),
});

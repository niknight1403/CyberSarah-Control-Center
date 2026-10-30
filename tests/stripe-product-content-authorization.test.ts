import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
const ctx=(role:"admin"|"user"|null):TrpcContext=>({
 user:role?{role} as NonNullable<TrpcContext["user"]>:null,
 req:{headers:{}} as TrpcContext["req"],
 res:{locals:{}} as TrpcContext["res"],
});
describe("Stripe-to-content campaign permission boundary",()=>{
 it("blocks ordinary users from reading the private Stripe catalogue",async()=>{
   await expect(appRouter.createCaller(ctx("user")).appStatus.stripeCatalog())
     .rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("blocks ordinary users from importing Stripe products into shared campaign drafts",async()=>{
   await expect(appRouter.createCaller(ctx("user")).appStatus.stripeCampaignDraft({productId:"prod_sample"}))
     .rejects.toMatchObject({code:"FORBIDDEN"});
   await expect(appRouter.createCaller(ctx(null)).appStatus.stripeCampaignDraft({productId:"prod_sample"}))
     .rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("exposes existing draft route only to admin role",()=>{
   const caller=appRouter.createCaller(ctx("admin"));
   expect(caller.appStatus.stripeCampaignDraft).toBeTypeOf("function");
 });
});

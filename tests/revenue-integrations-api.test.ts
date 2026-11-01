import {describe,it,expect} from "vitest";
import {revenueIntegrationsRouter} from "../server/revenue-integrations-router";

const makeCaller=(role:string|null)=>{
 const user=role?{id:1,role}:null;
 return revenueIntegrationsRouter.createCaller({
  user,res:{locals:{}},req:{}
 } as any);
};

describe("revenue admin API integration",()=>{
 it("blocks unauthenticated users from revenue planning",async()=>{
  const caller=makeCaller(null);
  await expect(caller.safetyStatus()).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(caller.schedulePreview({now:"2026-11-01T11:00:00Z"}))
   .rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("protects live PostgreSQL meter health behind admin role",async()=>{
  await expect(makeCaller("user").meterQueueHealth()).rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("blocks non-admin users from policy previews",async()=>{
  const caller=makeCaller("user");
  await expect(caller.outreachWindowPreview({now:"2026-11-01T11:00:00Z"}))
   .rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("exposes disabled production capabilities to admins",async()=>{
  const status=await makeCaller("admin").safetyStatus();
  expect(status).toMatchObject({billingEnabled:false,outboundEnabled:false,weeklyPublishingEnabled:false,liveKpisConnected:false});
 });
 it("plans weekly drafts without publishing or sending",async()=>{
  const caller=makeCaller("admin");
  expect(await caller.schedulePreview({now:"2026-11-01T11:00:00Z"}))
   .toMatchObject({requiresApproval:true,publishAutomatically:false});
  expect(await caller.outreachWindowPreview({now:"2026-11-01T11:00:00Z"}))
   .toMatchObject({willSend:false});
 });
 it("never confuses supplied queue preview with live measurements",async()=>{
  const caller=makeCaller("admin");
  const out=await caller.meterQueuePreview({rows:[{state:"failed",attempts:2}],sentIds:["abc"],providerIds:[]});
  expect(out).toMatchObject({source:"supplied_preview_only",counts:{failed:1,retries:1},
    reconciliation:{missing:["abc"]}});
 });
 it("rejects unjustified outreach permissions",async()=>{
  const caller=makeCaller("admin");
  const out=await caller.outreachPolicyPreview({
   approved:true,consentRecorded:true,unsubscribed:false,
   domainVerified:true,recipient:"customer@example.com",suppressedAddresses:["CUSTOMER@example.com"]
  });
  expect(out).toMatchObject({allowedBySuppliedPolicy:false,willSend:false});
 });
 it("requires attributable metrics and rejects impossible conversion",async()=>{
  const caller=makeCaller("admin");
  await expect(caller.attributedMetricsPreview({subscriptionMonthlyCents:[100],leads:1,
   customers:2,apiEvents:0,source:"fixture",asOf:"2026-11-01T11:00:00Z"})).rejects.toThrow();
 });
});

import {describe,it,expect} from "vitest";
import {authorizeBilling,summarizeMeterQueue,reconcileMeterEvents,nextHubSpotCursor,
 advanceCrmCheckpoint,maySendOutreach,isSuppressed,nextOutreachWindow,
 nextWeeklyDraft,auditedRevenueKpis} from "../server/revenue-sprint-primitives";

describe("ten revenue safety milestones",()=>{
 it("1 tenant-owned Stripe mapping prevents cross-tenant billing",()=>{
  const m={tenantId:"tenant-a",stripeCustomerId:"cus_123",meterName:"ai_tokens",enabled:true};
  expect(authorizeBilling("tenant-a",m,true).customerId).toBe("cus_123");
  expect(()=>authorizeBilling("tenant-b",m,true)).toThrow();
 });
 it("2 meter queue insights expose retries",()=>{
  expect(summarizeMeterQueue([{state:"sent",attempts:2},{state:"failed",attempts:5}]))
    .toMatchObject({sent:1,failed:1,retries:2});
 });
 it("3 reconciliation reports missing Stripe receipts",()=>{
  expect(reconcileMeterEvents(["a","b"],["b"])).toEqual({matched:["b"],missing:["a"]});
 });
 it("4 CRM pagination rejects replay cursor",()=>{
  expect(nextHubSpotCursor({paging:{next:{after:"two"}}},new Set(["one"]))).toBe("two");
  expect(()=>nextHubSpotCursor({paging:{next:{after:"one"}}},new Set(["one"]))).toThrow();
 });
 it("5 CRM checkpoint only advances for validated batches",()=>{
  expect(advanceCrmCheckpoint("old","new",5)).toEqual({cursor:"new",processed:5,complete:false});
  expect(()=>advanceCrmCheckpoint(null,"next",-1)).toThrow();
 });
 it("6 outreach requires consent approval and verified domain",()=>{
  expect(maySendOutreach({approved:true,consentRecorded:true,unsubscribed:false,domainVerified:true})).toBe(true);
  expect(maySendOutreach({approved:true,consentRecorded:false,unsubscribed:false,domainVerified:true})).toBe(false);
 });
 it("7 suppression lookup normalizes email case",()=>{
  expect(isSuppressed("  CUSTOMER@EXAMPLE.COM ",new Set(["customer@example.com"]))).toBe(true);
 });
 it("8 dispatcher produces a future UTC window, not an immediate send",()=>{
  expect(nextOutreachWindow(new Date("2026-11-01T11:00:00Z"))).toBe("2026-11-02T10:00:00.000Z");
 });
 it("9 content schedules always require approval",()=>{
  expect(nextWeeklyDraft(new Date("2026-11-01T11:00:00Z")))
   .toEqual({dueAt:"2026-11-02T09:00:00.000Z",requiresApproval:true,publishAutomatically:false});
 });
 it("10 KPI snapshots track provenance and reject fabricated ratios",()=>{
  expect(auditedRevenueKpis({subscriptionMonthlyCents:[1000,2000],leads:10,customers:2,apiEvents:10,
   source:"test-fixture",asOf:"2026-11-01T00:00:00Z"}).mrrCents).toBe(3000);
  expect(()=>auditedRevenueKpis({subscriptionMonthlyCents:[],leads:1,customers:2,apiEvents:0,
   source:"x",asOf:"2026-11-01T00:00:00Z"})).toThrow();
 });
});

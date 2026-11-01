import {describe,it,expect,vi} from "vitest";
import {hubspotContacts,hubspotDeals,firecrawlPreview,validateApprovedEmail,
 sendApprovedEmail,sendStripeMeterEvent,validateUsage,revenueKpis,draftWeeklyMarketing} from "../server/revenue-connectors";
const response=(payload:object,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload}) as Response;
describe("revenue connectors: safe HTTP contracts",()=>{
 it("reads CRM contacts and deals with auth, bounded pagination",async()=>{
  const mock=vi.fn().mockResolvedValue(response({results:[{id:"123",properties:{email:"a@b.com"}}]}));
  expect((await hubspotContacts("secret",100,mock))[0].id).toBe("123");
  expect(mock.mock.calls[0][0]).toContain("limit=50");
  expect(mock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  expect((await hubspotDeals("secret",2,mock))).toHaveLength(1);
  await expect(hubspotContacts("",2,mock)).rejects.toThrow("konfiguriert");
 });
 it("fails on untrusted scrape hosts and only returns public excerpt",async()=>{
  const mock=vi.fn().mockResolvedValue(response({success:true,data:{markdown:"content",metadata:{title:"Company"}}}));
  await expect(firecrawlPreview("abc","http://example.org",mock)).rejects.toThrow();
  await expect(firecrawlPreview("abc","https://localhost/x",mock)).rejects.toThrow();
  const out=await firecrawlPreview("abc","https://example.org",mock);
  expect(out.title).toBe("Company");
  expect(mock.mock.calls[0][0]).toContain("/v2/scrape");
 });
 it("blocks mass-mail without explicit approval or after opt-out",async()=>{
  const email={from:"a@example.com",to:"b@example.com",subject:"Useful feature",
    text:"A relevant account-specific project update for you.",idempotencyKey:"review123456789012",
    approved:false,optedOut:false};
  expect(()=>validateApprovedEmail(email)).toThrow();
  const mock=vi.fn().mockResolvedValue(response({id:"email-id"}));
  await expect(sendApprovedEmail("key",email,mock)).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
  const sent=await sendApprovedEmail("key",{...email,approved:true},mock);
  expect(sent.id).toBe("email-id");
  expect(mock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(email.idempotencyKey);
  await expect(sendApprovedEmail("key",{...email,approved:true,optedOut:true},mock)).rejects.toThrow();
 });
 it("validates event ledger and Stripe usage API request",async()=>{
  const usage={eventId:"event-0000001",customerId:"cus_12345",meterEventName:"ai_tokens",units:120,occurredAt:Math.floor(Date.now()/1000)};
  expect(()=>validateUsage({...usage,units:-1})).toThrow();
  const mock=vi.fn().mockResolvedValue(response({event_name:"ai_tokens",identifier:"event-0000001"}));
  const out=await sendStripeMeterEvent("sk_test_123",usage,mock);
  expect(out.event_name).toBe("ai_tokens");
  expect(mock.mock.calls[0][0]).toContain("meter_events");
  expect(mock.mock.calls[0][1].body).toContain("payload%5Bvalue%5D=120");
 });
 it("computes transparent preview KPIs and draft-only content",()=>{
  expect(revenueKpis({activeSubscriptionCents:[999,2001],leads:20,conversions:3,apiCalls:17}))
   .toEqual({mrrCents:3000,conversionRate:15,activeApiUsage:17});
  expect(draftWeeklyMarketing({product:"CyberSarah",feature:"Reliable consent checks",
    result:"Webhook diagnostics confirmed",link:"https://example.org"}).state).toBe("draft_only");
 });
});

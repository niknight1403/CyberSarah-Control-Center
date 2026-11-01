import {describe,it,expect,vi} from "vitest";
import {enqueueMeterEvent,claimMeterEvent,markMeterSent,markMeterFailure,
  dispatchOneMeterEvent,quarantineExhaustedMeterLeases,METER_LEDGER_SCHEMA,type SqlClient} from "../server/revenue-meter-ledger";
const event={eventId:"event_000000001",customerId:"cus_123456",meterEventName:"ai_tokens",
  units:80,occurredAt:Math.floor(Date.now()/1000)};
const db=(...responses:Record<string,unknown>[][]):SqlClient=>{
  const mock=vi.fn().mockImplementation(async()=>({rows:responses.shift()??[]}));
  return {query:mock};
};
describe("durable revenue metering",()=>{
 it("declares a unique durable ledger, lease and retry index",()=>{
   expect(METER_LEDGER_SCHEMA).toContain("event_id text PRIMARY KEY");
   expect(METER_LEDGER_SCHEMA).toContain("revenue_meter_events_dispatch_idx");
 });
 it("enqueues and rejects conflicting replay IDs",async()=>{
   expect(await enqueueMeterEvent(db([{event_id:event.eventId}]),event)).toBe("inserted");
   const replay=db([], [{customer_id:event.customerId,meter_event_name:event.meterEventName,
     units:event.units,occurred_at:event.occurredAt}]);
   expect(await enqueueMeterEvent(replay,event)).toBe("duplicate");
   await expect(enqueueMeterEvent(db([], [{customer_id:"cus_different",meter_event_name:event.meterEventName,
     units:80,occurred_at:event.occurredAt}]),event)).rejects.toThrow("collision");
   await expect(enqueueMeterEvent(db(),{...event,units:-1})).rejects.toThrow();
 });
 it("claims once and fences successful acknowledgement by attempt",async()=>{
   const claimed=await claimMeterEvent(db([{event_id:event.eventId,customer_id:event.customerId,
     meter_event_name:event.meterEventName,units:80,occurred_at:event.occurredAt,attempts:1}]));
   expect(claimed?.attempts).toBe(1);
   expect(await claimMeterEvent(db([]))).toBeNull();
   expect(await markMeterSent(db([{event_id:event.eventId}]),claimed!)).toBe(true);
   expect(await markMeterSent(db([]),claimed!)).toBe(false);
   const failure=db([]);
   await markMeterFailure(failure,claimed!,new Error("Provider 429"));
 });
 it("quarantines exhausted worker leases and supports repeated cleanup",async()=>{
  expect(await quarantineExhaustedMeterLeases(db([{event_id:"expired-a"},{event_id:"expired-b"}]))).toBe(2);
  expect(await quarantineExhaustedMeterLeases(db([]))).toBe(0);
 });
 it("dispatches only after explicit invocation, with stable Stripe ID",async()=>{
   const row={event_id:event.eventId,customer_id:event.customerId,
     meter_event_name:event.meterEventName,units:80,occurred_at:event.occurredAt,attempts:1};
   const conn=db([row],[{event_id:event.eventId}]);
   const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({event_name:"ai_tokens"})});
   expect(await dispatchOneMeterEvent(conn,"sk_test_key",http)).toBe("sent");
   expect(http).toHaveBeenCalledTimes(1);
   expect(http.mock.calls[0][1].body).toContain(event.eventId);
   expect(await dispatchOneMeterEvent(db([]),"sk_test_key",http)).toBe("empty");
   const failed=vi.fn().mockResolvedValue({ok:false,status:429});
   expect(await dispatchOneMeterEvent(db([row],[]),"sk_test_key",failed)).toBe("retry");
 });
});

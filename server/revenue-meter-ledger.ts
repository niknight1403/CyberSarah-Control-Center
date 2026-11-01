/**
 * Durable, opt-in queue for Stripe meter events.
 * Requires schema initialization by the operator and a worker with explicit
 * authorization to dispatch. This module NEVER sends usage by itself.
 * The unique identifier is reused on retries for Stripe-side deduplication.
 */
import {validateUsage, type BillableUsage, sendStripeMeterEvent} from "./revenue-connectors";

export interface SqlClient {
  query(sql: string, values?: readonly unknown[]): Promise<{rows: Record<string, unknown>[]; rowCount?: number | null}>;
}
export const METER_LEDGER_SCHEMA = `
CREATE TABLE IF NOT EXISTS revenue_meter_events (
  event_id text PRIMARY KEY,
  customer_id text NOT NULL,
  meter_event_name text NOT NULL,
  units integer NOT NULL CHECK (units > 0 AND units <= 1000000),
  occurred_at bigint NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revenue_meter_events_dispatch_idx
  ON revenue_meter_events (next_attempt_at, created_at)
  WHERE state IN ('pending','processing');
`;

export async function enqueueMeterEvent(db:SqlClient, event:BillableUsage):Promise<"inserted"|"duplicate"> {
  validateUsage(event);
  const result=await db.query(
    `INSERT INTO revenue_meter_events (event_id,customer_id,meter_event_name,units,occurred_at)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.eventId,event.customerId,event.meterEventName,event.units,event.occurredAt]);
  if(result.rows.length) return "inserted";
  // A duplicate ID with a different payload must never silently overwrite a charge.
  const prior=await db.query(
    "SELECT customer_id,meter_event_name,units,occurred_at FROM revenue_meter_events WHERE event_id=$1",[event.eventId]);
  const row=prior.rows[0];
  if(!row || row.customer_id!==event.customerId || row.meter_event_name!==event.meterEventName ||
     Number(row.units)!==event.units || Number(row.occurred_at)!==event.occurredAt)
    throw new Error("Meter event ID collision with different payload");
  return "duplicate";
}
export type ClaimedMeterEvent = BillableUsage & {attempts:number};
/** Atomic cross-worker claim with a 90s lease; dead workers can be recovered. */
export async function claimMeterEvent(db:SqlClient):Promise<ClaimedMeterEvent|null> {
  const result=await db.query(`
    UPDATE revenue_meter_events SET
      state='processing', attempts=attempts+1, locked_until=now()+interval '90 seconds'
    WHERE event_id=(
      SELECT event_id FROM revenue_meter_events
      WHERE attempts < 5 AND next_attempt_at <= now()
        AND (state='pending' OR (state='processing' AND locked_until < now()))
      ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING event_id,customer_id,meter_event_name,units,occurred_at,attempts`);
  const row=result.rows[0]; if(!row)return null;
  return {eventId:String(row.event_id),customerId:String(row.customer_id),
    meterEventName:String(row.meter_event_name),units:Number(row.units),
    occurredAt:Number(row.occurred_at),attempts:Number(row.attempts)};
}
/** Mark success only for the lease owner (attempt number). */
export async function markMeterSent(db:SqlClient,event:ClaimedMeterEvent):Promise<boolean>{
  const r=await db.query(`UPDATE revenue_meter_events
    SET state='sent',sent_at=now(),locked_until=NULL,last_error=NULL
    WHERE event_id=$1 AND state='processing' AND attempts=$2 RETURNING event_id`,
    [event.eventId,event.attempts]);
  return r.rows.length===1;
}
export async function markMeterFailure(db:SqlClient,event:ClaimedMeterEvent,error:unknown):Promise<void>{
  const message=error instanceof Error?error.message:String(error);
  await db.query(`UPDATE revenue_meter_events SET
    state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
    locked_until=NULL, last_error=$3,
    next_attempt_at=now()+((LEAST(3600, POWER(2,attempts)*15))::int * interval '1 second')
    WHERE event_id=$1 AND state='processing' AND attempts=$2`,
    [event.eventId,event.attempts,message.slice(0,300)]);
}
/**
 * Recover exhausted leases after worker termination. Otherwise a fifth attempt
 * can remain 'processing' forever because claimMeterEvent skips attempts >= 5.
 * Safe to invoke repeatedly; only expired leases are changed.
 */
export async function quarantineExhaustedMeterLeases(db:SqlClient):Promise<number>{
  const result=await db.query(`UPDATE revenue_meter_events
    SET state='failed',locked_until=NULL,
      last_error=COALESCE(last_error,'Worker lease expired after maximum attempts')
    WHERE state='processing' AND attempts>=5 AND locked_until<now()
    RETURNING event_id`);
  return result.rows.length;
}
/** One dispatch iteration; intentionally not registered as a background job. */
export async function dispatchOneMeterEvent(db:SqlClient, stripeKey:string,
    http:typeof fetch=fetch):Promise<"empty"|"sent"|"retry">{
  if(!stripeKey.startsWith("sk_"))throw new Error("Stripe credential not configured");
  const event=await claimMeterEvent(db);
  if(!event)return "empty";
  try {
    await sendStripeMeterEvent(stripeKey,event,http);
    if(!await markMeterSent(db,event))throw new Error("Meter lease changed during delivery");
    return "sent";
  }catch(err){
    await markMeterFailure(db,event,err);
    return "retry";
  }
}

/**
 * Revenue safety and orchestration primitives. No background actions and no
 * external writes. Callers must persist approvals, checkpoints and receipts.
 */
import {z} from "zod";
export const accountMappingSchema=z.object({
 tenantId:z.string().min(1).max(100),
 stripeCustomerId:z.string().regex(/^cus_[A-Za-z0-9]+$/),
 meterName:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{2,80}$/),
 enabled:z.boolean(),
});
export function authorizeBilling(tenant:string, mapping:unknown, subscriptionActive:boolean){
 const m=accountMappingSchema.parse(mapping);
 if(m.tenantId!==tenant || !m.enabled || !subscriptionActive)throw new Error("Billing mapping not authorized");
 return {customerId:m.stripeCustomerId,meterEventName:m.meterName};
}
export type MeterState="pending"|"processing"|"sent"|"failed";
export function summarizeMeterQueue(rows:readonly {state:MeterState;attempts:number}[]){
 const result={pending:0,processing:0,sent:0,failed:0,retries:0};
 for(const r of rows){result[r.state]++;if(r.attempts>1)result.retries++;}
 return result;
}
export function reconcileMeterEvents(sent:readonly string[],provider:readonly string[]){
 const observed=new Set(provider);
 return {matched:sent.filter(id=>observed.has(id)),missing:sent.filter(id=>!observed.has(id))};
}
export function nextHubSpotCursor(page:unknown,seen:ReadonlySet<string>){
 const parsed=z.object({paging:z.object({next:z.object({after:z.string().min(1)})}).optional()}).parse(page);
 const cursor=parsed.paging?.next?.after??null;
 if(cursor&&seen.has(cursor))throw new Error("CRM pagination loop detected");
 return cursor;
}
export function advanceCrmCheckpoint(current:string|null,next:string|null,accepted:number){
 if(!Number.isSafeInteger(accepted)||accepted<0||accepted>10000)throw new Error("Invalid batch size");
 return {cursor:next??current,processed:accepted,complete:next===null};
}
export type OutreachPolicy={approved:boolean;consentRecorded:boolean;unsubscribed:boolean;domainVerified:boolean};
export function maySendOutreach(p:OutreachPolicy){
 return p.approved&&p.consentRecorded&&!p.unsubscribed&&p.domainVerified;
}
export function isSuppressed(email:string,entries:ReadonlySet<string>){
 return entries.has(email.trim().toLowerCase());
}
export function nextOutreachWindow(now:Date,hourUtc=10){
 if(!Number.isInteger(hourUtc)||hourUtc<0||hourUtc>23)throw new Error("Invalid dispatch hour");
 const d=new Date(now);
 d.setUTCHours(hourUtc,0,0,0);
 if(d.getTime()<=now.getTime())d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString();
}
export function nextWeeklyDraft(now:Date,weekdayUtc=1,hourUtc=9){
 if(!Number.isInteger(weekdayUtc)||weekdayUtc<0||weekdayUtc>6||
    !Number.isInteger(hourUtc)||hourUtc<0||hourUtc>23)throw new Error("Invalid weekly schedule");
 const d=new Date(now);d.setUTCHours(hourUtc,0,0,0);
 let days=(weekdayUtc-d.getUTCDay()+7)%7;
 if(days===0&&d.getTime()<=now.getTime())days=7;
 d.setUTCDate(d.getUTCDate()+days);
 return {dueAt:d.toISOString(),requiresApproval:true as const,publishAutomatically:false as const};
}
export function auditedRevenueKpis(input:{subscriptionMonthlyCents:readonly number[];
 leads:number;customers:number;apiEvents:number;source:string;asOf:string}){
 if(!input.source || !Number.isFinite(Date.parse(input.asOf)))throw new Error("Missing KPI provenance");
 if(![input.leads,input.customers,input.apiEvents].every(v=>Number.isSafeInteger(v)&&v>=0)||
   input.customers>input.leads||
   !input.subscriptionMonthlyCents.every(v=>Number.isSafeInteger(v)&&v>=0))
    throw new Error("Invalid KPI totals");
 return {mrrCents:input.subscriptionMonthlyCents.reduce((a,b)=>a+b,0),
  conversionPercent:input.leads?Math.round(input.customers/input.leads*10000)/100:0,
  apiEvents:input.apiEvents,source:input.source,asOf:input.asOf,
  kind:"source_attributed_snapshot" as const};
}

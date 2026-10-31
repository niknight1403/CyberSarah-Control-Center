/**
 * Optional revenue connectors. Read-only by default. External writes are never
 * implied by an admin dashboard visit; provider secrets stay server-side.
 */
import {z} from "zod";

type Http = typeof fetch;
const short=(s:string)=>s.replace(/[^a-zA-Z0-9_.:/-]/g,"").slice(0,200);
async function jsonRequest<T>(http:Http, endpoint:string, key:string, method:"GET"|"POST",body?:object,headers:Record<string,string>={}):Promise<T>{
  if(!key.trim())throw new Error("Provider nicht konfiguriert.");
  const res=await http(endpoint,{method,headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json",...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12_000)});
  if(!res.ok)throw new Error("Provider HTTP "+res.status);
  return await res.json() as T;
}
const crmRecord=z.object({id:z.string(),properties:z.record(z.string(),z.unknown()).optional()});
export type CRMRecord=z.infer<typeof crmRecord>;
export async function hubspotContacts(key:string,limit=20,http:Http=fetch):Promise<CRMRecord[]>{
  const n=Math.min(Math.max(limit,1),50);
  const data=await jsonRequest<unknown>(http,"https://api.hubapi.com/crm/v3/objects/contacts?limit="+n+"&properties=email,firstname,lastname,lifecyclestage",key,"GET");
  return z.object({results:z.array(crmRecord)}).parse(data).results;
}
export async function hubspotDeals(key:string,limit=20,http:Http=fetch):Promise<CRMRecord[]>{
  const n=Math.min(Math.max(limit,1),50);
  const data=await jsonRequest<unknown>(http,"https://api.hubapi.com/crm/v3/objects/deals?limit="+n+"&properties=dealname,amount,dealstage,closedate",key,"GET");
  return z.object({results:z.array(crmRecord)}).parse(data).results;
}
function safeWebsite(value:string):string{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.port||!u.hostname.includes(".")
    ||u.hostname==="localhost"||u.hostname.endsWith(".local")||u.hostname.startsWith("[")||/^[0-9.]+$/.test(u.hostname)||/^(10|127|0|169\.254|192\.168)\./.test(u.hostname)
    ||u.hostname==="169.254.169.254"||u.hostname.endsWith(".internal"))
    throw new Error("Nur öffentliche HTTPS-Websites erlaubt.");
  return u.toString();
}
export async function firecrawlPreview(key:string,url:string,http:Http=fetch){
  const target=safeWebsite(url);
  const data=await jsonRequest<unknown>(http,"https://api.firecrawl.dev/v2/scrape",key,"POST",
    {url:target,formats:["markdown"],onlyMainContent:true});
  const parsed=z.object({success:z.boolean(),data:z.object({markdown:z.string().optional(),metadata:z.object({title:z.string().optional(),sourceURL:z.string().optional()}).optional()}).optional()}).parse(data);
  if(!parsed.success||!parsed.data)throw new Error("Firecrawl ohne verwertbares Ergebnis.");
  // Return only limited public-company content, not harvested personal emails.
  return {title:(parsed.data.metadata?.title??"").slice(0,160),url:target,excerpt:(parsed.data.markdown??"").slice(0,3000)};
}
export type ApprovedEmail={to:string;from:string;subject:string;text:string;approved:boolean;optedOut:boolean;idempotencyKey:string};
export function validateApprovedEmail(email:ApprovedEmail):void{
  if(!email.approved||email.optedOut)throw new Error("Outreach benötigt explizite Freigabe und kein Opt-out.");
  const addr=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!addr.test(email.to)||!addr.test(email.from)||email.subject.trim().length<4||
     email.text.trim().length<20||email.text.length>10000||
     !/^[a-zA-Z0-9_-]{12,128}$/.test(email.idempotencyKey))
    throw new Error("Ungültige Outreach-Nachricht oder Idempotenz-ID.");
}
export async function sendApprovedEmail(key:string,email:ApprovedEmail,http:Http=fetch){
  validateApprovedEmail(email);
  const result=await jsonRequest<unknown>(http,"https://api.resend.com/emails",key,"POST",{
    from:email.from,to:[email.to],subject:email.subject,text:email.text,
  },{"Idempotency-Key":email.idempotencyKey});
  return z.object({id:z.string().min(1)}).parse(result);
}
/** Use a stable event ID from a persisted ledger. Never bill a guessed usage value. */
export type BillableUsage={eventId:string;customerId:string;meterEventName:string;units:number;occurredAt:number};
export function validateUsage(u:BillableUsage){
  if(!/^[a-zA-Z0-9_-]{12,100}$/.test(u.eventId)||!/^cus_[A-Za-z0-9]+$/.test(u.customerId)||
     !/^[a-zA-Z][a-zA-Z0-9_]{2,80}$/.test(u.meterEventName)||
     !Number.isSafeInteger(u.units)||u.units<1||u.units>1_000_000||
     !Number.isSafeInteger(u.occurredAt)||Math.abs(Date.now()-u.occurredAt*1000)>34*86_400_000)
    throw new Error("Ungültiges Meter-Ereignis.");
}
export async function sendStripeMeterEvent(key:string,u:BillableUsage,http:Http=fetch){
  validateUsage(u);
  if(!key.startsWith("sk_"))throw new Error("Stripe Secret-Key fehlt.");
  const body=new URLSearchParams({
    event_name:u.meterEventName,identifier:u.eventId,timestamp:String(u.occurredAt),
    "payload[stripe_customer_id]":u.customerId,"payload[value]":String(u.units),
  });
  const res=await http("https://api.stripe.com/v1/billing/meter_events",{
    method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString(),signal:AbortSignal.timeout(12_000),
  });
  if(!res.ok)throw new Error("Stripe Meter Event HTTP "+res.status);
  return z.object({identifier:z.string().optional(),event_name:z.string()}).parse(await res.json());
}
export function revenueKpis(input:{activeSubscriptionCents:number[];leads:number;conversions:number;apiCalls:number}){
  const valid=input.activeSubscriptionCents.filter(x=>Number.isSafeInteger(x)&&x>=0);
  return {mrrCents:valid.reduce((a,b)=>a+b,0),
    conversionRate:input.leads>0?Math.round(Math.min(input.conversions/input.leads,1)*10000)/100:0,
    activeApiUsage:Math.max(0,Math.floor(input.apiCalls))};
}
export function draftWeeklyMarketing(input:{product:string;feature:string;result:string;link:string}){
  const title=short(input.product)||"CyberSarah";
  const feature=input.feature.trim().slice(0,500);
  const result=input.result.trim().slice(0,500);
  if(feature.length<8||result.length<8)throw new Error("Marketingbelege fehlen.");
  const link=safeWebsite(input.link);
  return {caseStudy:`${title}: ${feature}\n\nNachgewiesenes Ergebnis: ${result}\n\nMehr: ${link}`,
    releaseNotes:`${title} – Produktupdate\n\nNeu: ${feature}\n\nErgebnis: ${result}\n\nDetails: ${link}`,
    state:"draft_only" as const};
}

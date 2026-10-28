import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { collectRevenueAutopilotSnapshot } from "./revenue-autopilot";
import { runControlCenterAutopilot } from "./control-center-autopilot";
import { fetchTrendSignals } from "./trend-revenue-bridge";
import { draftQueue, revenueAttributionEvents, revenueExperiments, revenueJobs, revenueOffers } from "../drizzle/schema";
import { INFLUENCER_PERSONAS } from "../lib/influencer-persona-logic";
import {
  allocatePersonaBudget, buildOneClickBusinessBrief, deriveSystemState, planContentFactory,
  profitGuard, summarizeAttribution, type AttributionEvent, type PersonaMetric,
} from "../lib/revenue-os-v2-logic";

const jsonObject=(text:string):Record<string,unknown>|null=>{
  const clean=text.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\`\`\`\s*$/,"");
  const start=clean.indexOf("{"),end=clean.lastIndexOf("}");
  if(start<0||end<=start)return null;
  try{const value=JSON.parse(clean.slice(start,end+1));return value&&typeof value==="object"&&!Array.isArray(value)?value:null;}catch{return null;}
};
const llmJson=async(prompt:string,maxTokens=2200)=>{
  const result=await invokeLLM({messages:[{role:"system",content:prompt},{role:"user",content:"Antworte ausschließlich als valides JSON-Objekt ohne Markdown."}],maxTokens,responseFormat:{type:"json_object"}});
  const text=result.choices[0]?.message?.content;
  if(typeof text!=="string") throw new Error("LLM lieferte keinen strukturierten Inhalt.");
  const parsed=jsonObject(text);
  if(!parsed) throw new Error("LLM-Ausgabe war kein valides JSON.");
  return parsed;
};

export async function revenueOsV2Overview(){
  const db=await getDb();
  if(!db) throw new Error("Datenbank nicht verfügbar.");
  const since=new Date(Date.now()-30*86_400_000);
  const [snapshot,jobs,offers,experiments,events,trends]=await Promise.all([
    collectRevenueAutopilotSnapshot(),
    db.select().from(revenueJobs).orderBy(desc(revenueJobs.createdAt)).limit(20),
    db.select().from(revenueOffers).orderBy(desc(revenueOffers.updatedAt)).limit(100),
    db.select().from(revenueExperiments).orderBy(desc(revenueExperiments.updatedAt)).limit(30),
    db.select().from(revenueAttributionEvents).where(gte(revenueAttributionEvents.occurredAt,since)).limit(5000),
    fetchTrendSignals(),
  ]);
  const attrEvents:AttributionEvent[]=events.flatMap(e=>{
    if(!["impression","click","lead","purchase","refund"].includes(e.eventType)) return [];
    return [{personaId:e.personaId,contentId:e.contentId,platform:e.platform,eventType:e.eventType as AttributionEvent["eventType"],valueCents:e.valueCents}];
  });
  const attribution=summarizeAttribution(attrEvents);
  const personaMetrics:PersonaMetric[]=INFLUENCER_PERSONAS.map(p=>{
    const own=attrEvents.filter(e=>e.personaId===p.id);
    return {personaId:p.id,impressions:own.filter(e=>e.eventType==="impression").length,engagements:0,clicks:own.filter(e=>e.eventType==="click").length,leads:own.filter(e=>e.eventType==="lead").length,conversions:own.filter(e=>e.eventType==="purchase").length,revenueCents:own.reduce((s,e)=>s+(e.eventType==="purchase"?(e.valueCents??0):e.eventType==="refund"?-(e.valueCents??0):0),0)};
  });
  const budget=allocatePersonaBudget(personaMetrics);
  const activeOffers=offers.filter(o=>o.status==="active");
  const blockedJobs=jobs.filter(j=>j.status==="blocked");
  const deferredJobs=jobs.filter(j=>j.status==="deferred");
  const system=deriveSystemState([
    {name:"database",required:true,ok:true},
    {name:"revenue-data",required:true,ok:true},
    {name:"autopilot-jobs",required:true,ok:blockedJobs.length===0,detail:blockedJobs[0]?.lastError??undefined},
    {name:"provider-capacity",required:true,ok:deferredJobs.length===0,deferred:deferredJobs.length>0,detail:deferredJobs.length?"Provider-Limit aktiv":undefined},
  ]);
  const revenueCents=attribution.revenueCents+Math.round((snapshot.mrrEur??0)*100);
  const guard=profitGuard({revenueCents,variableCostCents:0,apiCostCents:0,refundsCents:Math.abs(attrEvents.filter(e=>e.eventType==="refund").reduce((s,e)=>s+(e.valueCents??0),0)),customers:attribution.purchases,leads:attribution.leads});
  return {system,snapshot,attribution,budget,profitGuard:guard,opportunityRadar:{ok:trends.ok,detail:trends.detail,trends:trends.trends.slice(0,10)},offers:{total:offers.length,active:activeOffers.length,items:offers},experiments:{total:experiments.length,active:experiments.filter(e=>e.status==="learning").length,items:experiments},jobs};
}

export async function recordRevenueAttribution(input:{eventKey:string;personaId:string;contentId:string;platform:string;eventType:AttributionEvent["eventType"];valueCents?:number}){
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  if(!INFLUENCER_PERSONAS.some(p=>p.id===input.personaId)) throw new Error("Unbekannte Persona.");
  const [row]=await db.insert(revenueAttributionEvents).values({...input,valueCents:Math.max(0,input.valueCents??0)}).onConflictDoNothing({target:revenueAttributionEvents.eventKey}).returning();
  return {stored:Boolean(row),id:row?.id??null};
}

export async function upsertRevenueOffer(input:{id?:number;kind:"affiliate"|"digital"|"subscription"|"b2b"|"lead-magnet";name:string;status:"draft"|"active"|"paused";priceCents?:number;marginPct?:number;targetUrl?:string;metadata?:Record<string,unknown>}){
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  const values={kind:input.kind,name:input.name.trim(),status:input.status,priceCents:input.priceCents??null,marginPct:input.marginPct??null,targetUrl:input.targetUrl??null,metadata:input.metadata??{},updatedAt:new Date()};
  if(input.id){const [row]=await db.update(revenueOffers).set(values).where(eq(revenueOffers.id,input.id)).returning();if(!row)throw new Error("Angebot nicht gefunden.");return row;}
  const [row]=await db.insert(revenueOffers).values(values).returning();return row;
}

export async function createRevenueExperiment(input:{name:string;dimension:"hook"|"visual"|"time"|"persona"|"cta"|"price";variants:Array<Record<string,unknown>>}){
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  if(input.variants.length<2) throw new Error("Experiment benötigt mindestens zwei Varianten.");
  const [row]=await db.insert(revenueExperiments).values({...input,status:"learning"}).returning();return row;
}

export async function enqueueRevenueJob(kind:string,payload:Record<string,unknown>,dedupeKey:string){
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  const [created]=await db.insert(revenueJobs).values({kind,payload,dedupeKey,status:"queued"}).onConflictDoNothing({target:revenueJobs.dedupeKey}).returning();
  if(created)return created;
  const [existing]=await db.select().from(revenueJobs).where(eq(revenueJobs.dedupeKey,dedupeKey)).limit(1);
  if(!existing) throw new Error("Job konnte nicht idempotent geladen werden.");
  return existing;
}

async function finishJob(id:number,status:"completed"|"deferred"|"blocked",result?:Record<string,unknown>,error?:string){
  const db=await getDb();if(!db)return;
  await db.update(revenueJobs).set({status,result:result??null,lastError:error??null,attempts:sql`${revenueJobs.attempts} + 1`,updatedAt:new Date()}).where(eq(revenueJobs.id,id));
}

export async function runRevenueMission(input:{command:string;dedupeKey?:string}){
  const command=input.command.trim(); if(command.length<4)throw new Error("Command zu kurz.");
  const key=input.dedupeKey?.trim()||`mission:${new Date().toISOString().slice(0,13)}:${command.toLowerCase().replace(/[^a-z0-9äöüß]+/gi,"-").slice(0,80)}`;
  const job=await enqueueRevenueJob("mission",{command},key);
  if(job.status==="completed")return {job,reused:true};
  try{
    const autopilot=await runControlCenterAutopilot();
    const status=autopilot.ok?"completed":autopilot.deferred.length&&!autopilot.blocked.length?"deferred":"blocked";
    const result={command,autopilot,executedAt:new Date().toISOString()};
    await finishJob(job.id,status,result,status==="blocked"?autopilot.blocked.join("; "):undefined);
    return {job:{...job,status,result},reused:false};
  }catch(error){
    const message=error instanceof Error?error.message:"Mission fehlgeschlagen";
    const deferred=/429|quota|rate.?limit|resource_exhausted/i.test(message);
    await finishJob(job.id,deferred?"deferred":"blocked",undefined,message);
    throw error;
  }
}

export async function createOneClickBusiness(input:{idea:string;audience?:string;goal?:string}){
  const brief=buildOneClickBusinessBrief(input);
  const data=await llmJson(brief+"\nJSON-Felder: audience, positioning, personaId, contentPlan(array), leadMagnet, offer, landingPage(array), measurementPlan(array), risks(array).",2600);
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const note=`One-Click Business: ${input.idea.trim()}`.slice(0,300);
  const [row]=await db.insert(draftQueue).values({kind:"idea",title:note.slice(0,120),payload:{note,rationale:"KI-generierter Business-Funnel auf Basis des Nutzerbriefings; Prognosen bleiben Hypothesen.",businessPlan:data},status:"pending",createdBy:"revenue-os-v2"}).returning();
  return {draftId:row.id,plan:data,status:"pending"};
}

export async function createContentFactory(input:{personaId:string;topic:string;maxAssets?:number}){
  const persona=INFLUENCER_PERSONAS.find(p=>p.id===input.personaId);if(!persona)throw new Error("Unbekannte Persona.");
  const plan=planContentFactory(input.maxAssets??30);
  const prompt=[
    `Du bist ${persona.name}, transparente KI-Persönlichkeit für ${persona.niche}.`,
    `Thema: ${input.topic.trim()}. Zielgruppe: ${persona.audience}. Tonalität: ${persona.tonality}.`,
    `Erzeuge exakt ${plan.length} hochwertige Assets gemäß diesem Formatplan: ${JSON.stringify(plan)}.`,
    "Keine erfundenen Reichweiten, Umsätze, Erfahrungen oder Testimonials. KI-Offenlegung muss bei personenbezogenem Auftreten sichtbar bleiben.",
    'JSON: {"assets":[{"format":"reel|tiktok|carousel|story|social|newsletter|landing|cta","variant":1,"title":"...","content":"...","cta":"...","qualityReason":"..."}]}'
  ].join("\n");
  const data=await llmJson(prompt,7000);
  const raw=Array.isArray(data.assets)?data.assets:[];
  const assets=raw.filter((x):x is Record<string,unknown>=>Boolean(x&&typeof x==="object"&&typeof (x as Record<string,unknown>).content==="string"&&String((x as Record<string,unknown>).content).trim().length>=20)).slice(0,plan.length);
  if(!assets.length)throw new Error("Content Factory lieferte keine validen Assets.");
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [row]=await db.insert(draftQueue).values({kind:"content",title:input.topic.trim().slice(0,120),payload:{personaId:persona.id,platform:"multi-format",topic:input.topic.trim(),content:String(assets[0].content),assets,assetCount:assets.length,disclosure:persona.disclosure},status:"pending",createdBy:"content-factory-v2"}).returning();
  return {draftId:row.id,personaId:persona.id,assets,status:"pending"};
}

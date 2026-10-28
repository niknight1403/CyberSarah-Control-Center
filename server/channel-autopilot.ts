import { and, desc, eq, gte, sql } from "drizzle-orm";
import { draftQueue,publishingJobs,revenueAttributionEvents,revenueExperiments } from "../drizzle/schema";
import { DRAFT_MAX_PENDING_BY_KIND, type RevenueLoopDraftPayload } from "../lib/draft-engine-logic";
import { buildChannelContentDraft,buildChannelExperimentDraft,channelAutopilotHealth,decideChannelAutopilot,type ChannelAutopilotSnapshot } from "../lib/channel-autopilot-logic";
import { getDb } from "./db";

const PERSONA="automationsklar-editorial";
const INTERVAL_MS=15*60_000;
let timer:ReturnType<typeof setInterval>|null=null;
let busy=false;

export async function collectChannelAutopilotSnapshot(days=30):Promise<ChannelAutopilotSnapshot>{
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  const since=new Date(Date.now()-Math.min(90,Math.max(1,days))*86_400_000);
  const [events,jobs,experiments,pending]=await Promise.all([
    db.select().from(revenueAttributionEvents).where(and(eq(revenueAttributionEvents.personaId,PERSONA),gte(revenueAttributionEvents.occurredAt,since))).limit(20000),
    db.select().from(publishingJobs).where(and(eq(publishingJobs.persona,PERSONA),gte(publishingJobs.createdAt,since))).orderBy(desc(publishingJobs.createdAt)).limit(5000),
    db.select().from(revenueExperiments).where(eq(revenueExperiments.status,"learning")).limit(100),
    db.select({kind:draftQueue.kind,payload:draftQueue.payload}).from(draftQueue).where(eq(draftQueue.status,"pending")).limit(500),
  ]);
  const count=(type:string)=>events.filter(e=>e.eventType===type).length;
  const purchaseCents=events.filter(e=>e.eventType==="purchase").reduce((s,e)=>s+(e.valueCents??0),0);
  const refundCents=events.filter(e=>e.eventType==="refund").reduce((s,e)=>s+(e.valueCents??0),0);
  const insightImpressions=jobs.reduce((s,j)=>s+Number(j.insights?.impressions??j.insights?.reach??0),0);
  return {
    impressions:Math.max(count("impression"),insightImpressions),
    views:events.filter(e=>e.eventType==="view").length,
    clicks:count("click"),leads:count("lead"),purchases:count("purchase"),refunds:count("refund"),
    confirmedRevenueCents:purchaseCents-refundCents,
    published:jobs.filter(j=>j.status==="veroeffentlicht").length,
    failed:jobs.filter(j=>j.status==="fehlgeschlagen").length,
    activeExperiments:experiments.length,
    pendingContentDrafts:pending.filter(x=>x.kind==="content").length,
    pendingRevenueDrafts:pending.filter(x=>x.kind==="revenue-loop").length,
  };
}

export async function channelAutopilotOverview(){
  const snapshot=await collectChannelAutopilotSnapshot();
  const decision=decideChannelAutopilot(snapshot);
  return {mode:"24/7-observe-diagnose-draft-learn",snapshot,health:channelAutopilotHealth(snapshot),decision,externalActionsExecuted:0,generatedAt:new Date().toISOString()};
}

export async function runChannelAutopilot(){
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  const snapshot=await collectChannelAutopilotSnapshot();
  const decision=decideChannelAutopilot(snapshot);
  const experiment=buildChannelExperimentDraft(decision);
  const content=buildChannelContentDraft(decision);
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cybersarah-channel-autopilot'))`);
    const pending=await tx.select({kind:draftQueue.kind,payload:draftQueue.payload}).from(draftQueue).where(eq(draftQueue.status,"pending"));
    const revenueKeys=new Set(pending.filter(x=>x.kind==="revenue-loop").map(x=>(x.payload as RevenueLoopDraftPayload).autopilotKey).filter(Boolean));
    const contentKeys=new Set(pending.filter(x=>x.kind==="content").map(x=>(x.payload as {autopilotKey?:string}).autopilotKey).filter(Boolean));
    let generated=0;
    if(!revenueKeys.has(experiment.autopilotKey)&&pending.filter(x=>x.kind==="revenue-loop").length<DRAFT_MAX_PENDING_BY_KIND["revenue-loop"]){
      await tx.insert(draftQueue).values({kind:"revenue-loop",title:experiment.name,payload:experiment,status:"pending",createdBy:"channel-autopilot"});
      generated++;
    }
    if(!contentKeys.has(content.autopilotKey)&&pending.filter(x=>x.kind==="content").length<DRAFT_MAX_PENDING_BY_KIND.content){
      await tx.insert(draftQueue).values({kind:"content",title:`Channel Autopilot · ${decision.lever}`,payload:content,status:"pending",createdBy:"channel-autopilot"});
      generated++;
    }
    return {generated};
  });
  return {snapshot,health:channelAutopilotHealth(snapshot),decision,...result,externalActionsExecuted:0};
}

async function tick(){
  if(busy)return; busy=true;
  try{
    const result=await runChannelAutopilot();
    if(result.generated>0) console.log(`[Channel-Autopilot] ${result.decision.lever}: ${result.generated} neue Pending-Drafts, 0 externe Aktionen.`);
  }catch(error){console.error("[Channel-Autopilot] Tick-Fehler:",error instanceof Error?error.message:error);}
  finally{busy=false;}
}

export function startChannelAutopilot(){
  if(timer)return;
  if(String(process.env.CHANNEL_AUTOPILOT??"on").toLowerCase()==="off"){console.log("[Channel-Autopilot] Deaktiviert via CHANNEL_AUTOPILOT=off.");return;}
  console.log("[Channel-Autopilot] Aktiv — 15-Minuten Observe→Diagnose→Draft→Learn Loop.");
  void tick();
  timer=setInterval(()=>void tick(),INTERVAL_MS);
}

export async function runChannelAutopilotTickOnce(){await tick();}

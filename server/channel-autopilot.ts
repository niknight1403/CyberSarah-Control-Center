import { and, desc, eq, gte, sql } from "drizzle-orm";
import { draftQueue,publishingJobs,revenueAttributionEvents,revenueExperiments } from "../drizzle/schema";
import { DRAFT_MAX_PENDING_BY_KIND, type RevenueLoopDraftPayload } from "../lib/draft-engine-logic";
import { buildChannelContentDraft,buildChannelExperimentDraft,channelAutopilotHealth,channelAutopilotDraftGate,channelEvidenceFingerprint,decideChannelAutopilot,type ChannelAutopilotSnapshot } from "../lib/channel-autopilot-logic";
import { getDb } from "./db";
import { materializeProductionSystem } from "./faceless-multichannel-service";

const PERSONA="automationsklar-editorial";
const INTERVAL_MS=15*60_000;
let timer:ReturnType<typeof setInterval>|null=null;
let busy=false;

export async function collectChannelAutopilotSnapshot(days=30):Promise<ChannelAutopilotSnapshot>{
  const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
  const since=new Date(Date.now()-Math.min(90,Math.max(1,days))*86_400_000);
  const [eventRows,jobs,experiments,pending]=await Promise.all([
    db.select({
      impressions:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='impression')`,
      views:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='view')`,
      clicks:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='click')`,
      leads:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='lead')`,
      purchases:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='purchase')`,
      refunds:sql<number>`count(*) filter (where ${revenueAttributionEvents.eventType}='refund')`,
      purchaseCents:sql<number>`coalesce(sum(case when ${revenueAttributionEvents.eventType}='purchase' then ${revenueAttributionEvents.valueCents} else 0 end),0)`,
      refundCents:sql<number>`coalesce(sum(case when ${revenueAttributionEvents.eventType}='refund' then ${revenueAttributionEvents.valueCents} else 0 end),0)`,
    }).from(revenueAttributionEvents).where(and(eq(revenueAttributionEvents.personaId,PERSONA),gte(revenueAttributionEvents.occurredAt,since))),
    db.select().from(publishingJobs).where(and(eq(publishingJobs.persona,PERSONA),gte(publishingJobs.createdAt,since))).orderBy(desc(publishingJobs.createdAt)).limit(5000),
    db.select().from(revenueExperiments).where(eq(revenueExperiments.status,"learning")).limit(100),
    db.select({kind:draftQueue.kind,payload:draftQueue.payload}).from(draftQueue).where(eq(draftQueue.status,"pending")).limit(500),
  ]);
  const events=eventRows[0]??{impressions:0,views:0,clicks:0,leads:0,purchases:0,refunds:0,purchaseCents:0,refundCents:0};
  const purchaseCents=Number(events.purchaseCents??0);
  const refundCents=Number(events.refundCents??0);
  const insightImpressions=jobs.reduce((s,j)=>s+Number(j.insights?.impressions??j.insights?.reach??0),0);
  const insightViews=jobs.reduce((s,j)=>s+Number(j.insights?.views??j.insights?.plays??j.insights?.video_views??0),0);
  return {
    impressions:Math.max(Number(events.impressions??0),insightImpressions),
    views:Math.max(Number(events.views??0),insightViews),
    clicks:Number(events.clicks??0),leads:Number(events.leads??0),purchases:Number(events.purchases??0),refunds:Number(events.refunds??0),
    confirmedRevenueCents:purchaseCents-refundCents,
    published:jobs.filter(j=>j.status==="veroeffentlicht").length,
    failed:jobs.filter(j=>j.status==="fehlgeschlagen").length,
    activeExperiments:experiments.filter(e=>e.name.startsWith("CHANNEL AUTO")).length,
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
  const cooldownBucket=Math.floor(Date.now()/(6*60*60_000));
  const evidenceFingerprint=channelEvidenceFingerprint(snapshot);
  const experiment=buildChannelExperimentDraft(decision,String(cooldownBucket),evidenceFingerprint);
  const content=buildChannelContentDraft(decision,evidenceFingerprint);
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cybersarah-channel-autopilot'))`);
    const pending=await tx.select({kind:draftQueue.kind,payload:draftQueue.payload}).from(draftQueue).where(eq(draftQueue.status,"pending"));
    const actualSnapshot={
      ...snapshot,
      pendingContentDrafts:pending.filter(x=>x.kind==="content").length,
      pendingRevenueDrafts:pending.filter(x=>x.kind==="revenue-loop").length,
    };
    const draftGate=channelAutopilotDraftGate(actualSnapshot);
    if(!draftGate.allowed){
      return {generated:0,skipped:draftGate.reason};
    }
    const recent=await tx.select({kind:draftQueue.kind,payload:draftQueue.payload}).from(draftQueue)
      .where(and(eq(draftQueue.createdBy,"channel-autopilot"),gte(draftQueue.createdAt,new Date(Date.now()-6*60*60_000))));
    const history=await tx.select({payload:draftQueue.payload}).from(draftQueue)
      .where(eq(draftQueue.createdBy,"channel-autopilot")).orderBy(desc(draftQueue.createdAt)).limit(50);
    const seenEvidence=new Set(history.map(x=>(x.payload as {evidenceFingerprint?:string}).evidenceFingerprint).filter(Boolean));
    if(seenEvidence.has(evidenceFingerprint)){
      return {generated:0,skipped:"no-material-new-evidence" as const};
    }
    const revenueKeys=new Set([...pending,...recent].filter(x=>x.kind==="revenue-loop").map(x=>(x.payload as RevenueLoopDraftPayload).autopilotKey).filter(Boolean));
    const contentKeys=new Set([...pending,...recent].filter(x=>x.kind==="content").map(x=>(x.payload as {autopilotKey?:string}).autopilotKey).filter(Boolean));
    let generated=0;
    if(!revenueKeys.has(experiment.autopilotKey)&&pending.filter(x=>x.kind==="revenue-loop").length<DRAFT_MAX_PENDING_BY_KIND["revenue-loop"]){
      const inserted = await tx.insert(draftQueue).values({kind:"revenue-loop",title:experiment.name,payload:experiment,status:"pending",createdBy:"channel-autopilot",dedupeKey:`channel-autopilot:revenue:${decision.lever}:${cooldownBucket}`}).onConflictDoNothing({target:draftQueue.dedupeKey}).returning({id:draftQueue.id});
      generated += inserted.length;
    }
    if(!contentKeys.has(content.autopilotKey)&&pending.filter(x=>x.kind==="content").length<DRAFT_MAX_PENDING_BY_KIND.content){
      const inserted = await tx.insert(draftQueue).values({kind:"content",title:`Channel Autopilot · ${decision.lever}`,payload:content,status:"pending",createdBy:"channel-autopilot",dedupeKey:`channel-autopilot:content:${decision.lever}:${cooldownBucket}`}).onConflictDoNothing({target:draftQueue.dedupeKey}).returning({id:draftQueue.id});
      generated += inserted.length;
    }
    return {generated,skipped:null as string|null};
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
  void materializeProductionSystem().catch(error=>console.error("[Channel-Autopilot] Produktionssystem konnte nicht materialisiert werden:",error instanceof Error?error.message:error));
  void tick();
  timer=setInterval(()=>void tick(),INTERVAL_MS);
}

export async function runChannelAutopilotTickOnce(){await tick();}

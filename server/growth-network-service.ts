import { desc, eq, gte, sql } from "drizzle-orm";
import { b2bNetworkEdges,b2bNetworkNodes,influencerLearningStates,publishingJobs,revenueAttributionEvents } from "../drizzle/schema";
import { INFLUENCER_PERSONAS } from "../lib/influencer-persona-logic";
import { buildAlwaysOnInfluencerPlan,buildB2BNetworkHealth,evolveInfluencerFromEvidence,prioritizeB2BNetwork } from "../lib/b2b-influencer-network-logic";
import { assignPersonasToB2B,buildB2BExpansionQueue,buildSaaSLoopEngineeringPlan } from "../lib/b2b-saas-loop-engineering-logic";
import { getDb } from "./db";

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(Number.isFinite(n)?n:0)));

export async function upsertB2BNode(input:{nodeKey:string;kind:"lead"|"customer"|"partner"|"creator"|"company";name:string;domain?:string;fit:number;intent:number;trust:number;relationshipStrength:number;estimatedValueCents?:number;optedOut?:boolean;metadata?:Record<string,unknown>}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const values={...input,fit:clamp(input.fit),intent:clamp(input.intent),trust:clamp(input.trust),relationshipStrength:clamp(input.relationshipStrength),estimatedValueCents:input.estimatedValueCents??null,optedOut:input.optedOut??false,metadata:input.metadata??{},lastActivityAt:new Date(),updatedAt:new Date()};
  const [row]=await db.insert(b2bNetworkNodes).values(values).onConflictDoUpdate({target:b2bNetworkNodes.nodeKey,set:values}).returning();
  return row;
}

export async function upsertB2BEdge(input:{edgeKey:string;fromNodeKey:string;toNodeKey:string;relation:string;stage:"discovered"|"qualified"|"engaged"|"customer"|"partner"|"paused";strength:number;evidence?:Record<string,unknown>}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  if(input.fromNodeKey===input.toNodeKey)throw new Error("B2B-Kante benötigt zwei unterschiedliche Knoten.");
  const values={...input,strength:clamp(input.strength),evidence:input.evidence??{},updatedAt:new Date()};
  const [row]=await db.insert(b2bNetworkEdges).values(values).onConflictDoUpdate({target:b2bNetworkEdges.edgeKey,set:values}).returning();
  return row;
}

export async function b2bNetworkOverview(){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [nodes,edges]=await Promise.all([
    db.select().from(b2bNetworkNodes).orderBy(desc(b2bNetworkNodes.updatedAt)).limit(1000),
    db.select().from(b2bNetworkEdges).orderBy(desc(b2bNetworkEdges.updatedAt)).limit(2000),
  ]);
  const now=Date.now();
  const priorities=prioritizeB2BNetwork(nodes.map(n=>({key:n.nodeKey,kind:n.kind as "lead"|"customer"|"partner"|"creator"|"company",fit:n.fit,intent:n.intent,trust:n.trust,relationshipStrength:n.relationshipStrength,estimatedValueCents:n.estimatedValueCents,lastActivityDays:n.lastActivityAt?Math.max(0,(now-n.lastActivityAt.getTime())/86_400_000):null,optedOut:n.optedOut})));
  const health=buildB2BNetworkHealth(
    nodes.map(n=>({key:n.nodeKey,kind:n.kind as "lead"|"customer"|"partner"|"creator"|"company",fit:n.fit,intent:n.intent,trust:n.trust,relationshipStrength:n.relationshipStrength,estimatedValueCents:n.estimatedValueCents,lastActivityDays:n.lastActivityAt?Math.max(0,(now-n.lastActivityAt.getTime())/86_400_000):null,optedOut:n.optedOut})),
    edges.map(e=>({stage:e.stage,strength:e.strength})),
  );
  const personaAssignments=assignPersonasToB2B(priorities,50);
  const expansionQueue=buildB2BExpansionQueue(priorities,personaAssignments,20);
  const saasLoop=buildSaaSLoopEngineeringPlan(health,priorities,personaAssignments);
  return {
    counts:{nodes:nodes.length,edges:edges.length,qualified:edges.filter(e=>e.stage==="qualified").length,customers:nodes.filter(n=>n.kind==="customer").length,partners:nodes.filter(n=>n.kind==="partner").length,optedOut:nodes.filter(n=>n.optedOut).length},
    health,
    priorities:priorities.slice(0,50),edges:edges.slice(0,100),
    personaAssignments,
    expansionQueue,
    saasLoop,
    autonomy:{
      discoveryAndScoring:true,
      personaAssignment:true,
      saasLoopEngineering:true,
      draftNextActions:true,
      unsolicitedOutreach:false,
      externalSendRequiresApproval:true,
    },
  };
}

function pillarFor(personaId:string,product:string){
  const persona=INFLUENCER_PERSONAS.find(p=>p.id===personaId);
  if(!persona)return "general";
  const lower=product.toLowerCase();
  return persona.contentPillars.find(p=>lower.includes(p.toLowerCase()))??"general";
}

export async function refreshInfluencerLearning(){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const since=new Date(Date.now()-30*86_400_000);
  const [events,jobs]=await Promise.all([
    db.select().from(revenueAttributionEvents).where(gte(revenueAttributionEvents.occurredAt,since)).limit(10000),
    db.select().from(publishingJobs).where(gte(publishingJobs.createdAt,since)).limit(10000),
  ]);
  const keys=[...new Set([...events.map(e=>`${e.personaId}:${e.platform}`),...jobs.map(j=>`${j.persona}:${j.platform}`)])];
  const signals=keys.map(key=>{
    const [personaId,platform]=key.split(":",2);
    const ownEvents=events.filter(e=>e.personaId===personaId&&e.platform===platform);
    const ownJobs=jobs.filter(j=>j.persona===personaId&&j.platform===platform);
    const pillarCounts=new Map<string,number>();
    ownJobs.forEach(j=>{const p=pillarFor(personaId,j.product);pillarCounts.set(p,(pillarCounts.get(p)??0)+1);});
    const pillar=[...pillarCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??"general";
    return {personaId,platform,pillar,
      impressions:ownEvents.filter(e=>e.eventType==="impression").length+ownJobs.reduce((s,j)=>s+Number(j.insights?.impressions??0),0),
      clicks:ownEvents.filter(e=>e.eventType==="click").length,
      leads:ownEvents.filter(e=>e.eventType==="lead").length,
      conversions:ownEvents.filter(e=>e.eventType==="purchase").length,
      revenueCents:ownEvents.reduce((s,e)=>s+(e.eventType==="purchase"?(e.valueCents??0):e.eventType==="refund"?-(e.valueCents??0):0),0),
      published:ownJobs.filter(j=>j.status==="veroeffentlicht"&&j.mode==="live").length,
      failed:ownJobs.filter(j=>j.status==="fehlgeschlagen"||j.status==="abgebrochen").length,
    };
  });
  const evolutions=evolveInfluencerFromEvidence(signals);
  for(const e of evolutions){
    const values={personaId:e.personaId,observations:e.observations,score:Math.round(e.score),platformWeights:e.platformWeights,pillarWeights:e.pillarWeights,nextExperiments:e.nextExperiments,learnedAt:new Date(),updatedAt:new Date()};
    await db.insert(influencerLearningStates).values(values).onConflictDoUpdate({target:influencerLearningStates.personaId,set:{...values,version:sql`${influencerLearningStates.version} + 1`}});
  }
  return {evolutions,plan:buildAlwaysOnInfluencerPlan(evolutions),windowDays:30};
}

export async function influencerLearningOverview(){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const states=await db.select().from(influencerLearningStates).orderBy(desc(influencerLearningStates.score));
  return {states,plan:buildAlwaysOnInfluencerPlan(states.map(s=>({personaId:s.personaId,observations:s.observations,score:s.score,platformWeights:s.platformWeights,pillarWeights:s.pillarWeights,nextExperiments:s.nextExperiments.flatMap(x=>x&&typeof x==="object"&&("dimension" in x)&&("value" in x)&&("reason" in x)?[{dimension:String(x.dimension) as "platform"|"pillar",value:String(x.value),reason:String(x.reason)}]:[]),guardrails:[]})))};
}

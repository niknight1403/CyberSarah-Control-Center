import {desc,eq,inArray} from "drizzle-orm";
import {b2bNetworkNodes,revenueJobs} from "../drizzle/schema";
import {
  aiInfluenzaLeadNodeKey,
  evaluateAiInfluenzaContactPolicy,
  scoreAiInfluenzaLead,
  type AiInfluenzaContactBasis,
  type AiInfluenzaLeadSignals,
} from "../lib/ai-influenza-lead-logic";
import {getDb} from "./db";
import {upsertB2BNode} from "./growth-network-service";

export async function upsertAiInfluenzaLead(input:{
  companyName:string;
  domain:string;
  publicSourceUrl:string;
  contactBasis:AiInfluenzaContactBasis;
  signals:AiInfluenzaLeadSignals;
  estimatedValueCents?:number;
  optedOut?:boolean;
}){
  const key=aiInfluenzaLeadNodeKey(input.domain);
  const scoring=scoreAiInfluenzaLead(input.signals);
  const policy=evaluateAiInfluenzaContactPolicy({
    basis:input.contactBasis,publicSourceUrl:input.publicSourceUrl,optedOut:Boolean(input.optedOut),
  });
  const node=await upsertB2BNode({
    nodeKey:key,kind:"company",name:input.companyName.trim(),domain:input.domain.trim().toLowerCase(),
    fit:input.signals.strategicFit,intent:Math.round((input.signals.automationPain+input.signals.contentNeed+input.signals.engagement)/3),
    trust:policy.mayPrepare?50:20,relationshipStrength:input.signals.engagement,
    estimatedValueCents:input.estimatedValueCents,optedOut:Boolean(input.optedOut),
    metadata:{
      businessUnit:"ai-influenza-team",leadScore:scoring.score,leadTier:scoring.tier,
      publicSourceUrl:input.publicSourceUrl,contactBasis:input.contactBasis,
      contactPolicy:policy.reason,externalSendApproved:false,
    },
  });
  return {node,scoring,policy};
}

export async function prepareAiInfluenzaProposal(input:{
  nodeKey:string;
  packageId:"starter"|"growth"|"business";
  createdByOpenId:string;
}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [node]=await db.select().from(b2bNetworkNodes).where(eq(b2bNetworkNodes.nodeKey,input.nodeKey)).limit(1);
  if(!node)throw new Error("Lead nicht gefunden.");
  if(node.optedOut)throw new Error("Opt-out: kein Angebot/Kontaktentwurf zulässig.");
  const metadata=node.metadata??{};
  if(metadata.businessUnit!=="ai-influenza-team")throw new Error("Lead gehört nicht zur AI-Influenza-Pipeline.");
  const publicSourceUrl=typeof metadata.publicSourceUrl==="string"?metadata.publicSourceUrl:"";
  const contactBasis=typeof metadata.contactBasis==="string"?metadata.contactBasis:"unknown";
  const policy=evaluateAiInfluenzaContactPolicy({
    basis:contactBasis as AiInfluenzaContactBasis,publicSourceUrl,optedOut:node.optedOut,
  });
  if(!policy.mayPrepare)throw new Error(policy.reason);
  const hour=new Date().toISOString().slice(0,13);
  const dedupeKey=`ai-influenza-proposal:${node.nodeKey}:${input.packageId}:${hour}`;
  const [created]=await db.insert(revenueJobs).values({
    dedupeKey,kind:"ai-influenza-proposal",status:"queued",
    payload:{
      businessUnit:"ai-influenza-team",nodeKey:node.nodeKey,packageId:input.packageId,
      ownerAgent:"sales-conversion",createdByOpenId:input.createdByOpenId,
      task:"proposal-draft",externalSendApproved:false,contactPolicy:policy.reason,
    },
  }).onConflictDoNothing({target:revenueJobs.dedupeKey}).returning();
  return {created:created??null,reused:!created,policy};
}

export async function aiInfluenzaLeadPipeline(limit=200){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const rows=await db.select().from(b2bNetworkNodes)
    .where(inArray(b2bNetworkNodes.kind,["lead","company","customer"]))
    .orderBy(desc(b2bNetworkNodes.updatedAt)).limit(Math.max(1,Math.min(500,limit)));
  const leads=rows.filter(row=>(row.metadata as Record<string,unknown>|null)?.businessUnit==="ai-influenza-team");
  const counts={
    total:leads.length,
    hot:leads.filter(x=>(x.metadata as Record<string,unknown>)?.leadTier==="hot").length,
    warm:leads.filter(x=>(x.metadata as Record<string,unknown>)?.leadTier==="warm").length,
    optedOut:leads.filter(x=>x.optedOut).length,
    customers:leads.filter(x=>x.kind==="customer").length,
  };
  return {counts,leads};
}

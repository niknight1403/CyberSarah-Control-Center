import { eq } from "drizzle-orm";
import { draftQueue } from "../drizzle/schema";
import { buildProductionTemplatePack,multiChannelStrategy,pipelineStandardization,type PipelineStandardization } from "../lib/faceless-multichannel-logic";
import { getDb } from "./db";

const CREATED_BY="faceless-multichannel-architect";

async function insertOnce(title:string,payload:Record<string,unknown>,key:string){
 const db=await getDb(); if(!db) throw new Error("Datenbank nicht verfügbar.");
 const dedupeKey="faceless-multichannel:"+key;
 const [row]=await db.insert(draftQueue).values({kind:"content",title,payload,status:"pending",createdBy:CREATED_BY,dedupeKey}).onConflictDoNothing({target:draftQueue.dedupeKey}).returning({id:draftQueue.id});
 if(row)return {inserted:true,id:row.id};
 const [existing]=await db.select({id:draftQueue.id}).from(draftQueue).where(eq(draftQueue.dedupeKey,dedupeKey)).limit(1);
 if(!existing)throw new Error("Multi-Channel-Draft konnte nicht dedupliziert werden.");
 return {inserted:false,id:existing.id};
}

export async function materializeProductionSystem(){
 const pack=buildProductionTemplatePack();
 const specs=[
  {key:"research-script-chain-v1",title:"Automationsklar · Prompt-Kette Research → Script",content:pack.promptChain.filter(x=>["RESEARCH","SCRIPT"].includes(x.stage))},
  {key:"voice-visual-chain-v1",title:"Automationsklar · Prompt-Kette Voice → Visuals",content:pack.promptChain.filter(x=>["VOICE","VISUALS"].includes(x.stage))},
  {key:"edit-qa-chain-v1",title:"Automationsklar · Prompt-Kette Edit → QA",content:pack.promptChain.filter(x=>["EDIT","QA"].includes(x.stage))},
  {key:"premiere-template-v1",title:"Automationsklar · Premiere Longform Template",content:pack.editTemplates.premiere},
  {key:"capcut-template-v1",title:"Automationsklar · CapCut Vertical Template",content:pack.editTemplates.capcut},
  {key:"sound-policy-v1",title:"Automationsklar · Sound Library Manifest",content:pack.soundLibrary},
  {key:"asset-manifest-v1",title:"Automationsklar · Asset & Lizenz Manifest",content:{fields:pack.assetManifest,rule:"Jedes verwendete Asset braucht nachvollziehbare kommerzielle Nutzungsrechte."}},
 ];
 const results=[];
 for(const spec of specs)results.push(await insertOnce(spec.title,{personaId:"automationsklar-editorial",platform:"production-system",topic:spec.title,content:JSON.stringify(spec.content,null,2),assets:[],assetCount:0,disclosure:"Interne Produktionsvorlage; keine externe Aktion.",channel:"Automationsklar",format:"production-template",template:spec.content,externalAction:"none"},spec.key));
 return {total:specs.length,inserted:results.filter(x=>x.inserted).length,existing:results.filter(x=>!x.inserted).length,ids:results.map(x=>x.id),externalActionsExecuted:0};
}

export async function planChannelExpansion(input:PipelineStandardization){
 const readiness=pipelineStandardization(input);
 const strategy=multiChannelStrategy(input);
 if(!readiness.channel2Ready){
  const key="proof-gap-"+readiness.weakestStage.toLowerCase();
  const title="Automationsklar · Standardisierung verbessern: "+readiness.weakestStage;
  const draft=await insertOnce(title,{personaId:"automationsklar-editorial",platform:"production-system",topic:title,content:"Aktueller Pipeline-Score: "+readiness.score+"%. Schwächste Stufe: "+readiness.weakestStage+" ("+readiness.weakestScore+"%). Blocker: "+readiness.blockers.join(" | ")+". Ziel: reproduzierbare Vorlage, QA-Check und Messpunkt erstellen.",assets:[],assetCount:0,disclosure:"Interne Optimierungsaufgabe.",channel:"Automationsklar",format:"standardization-gap",readiness,externalAction:"none"},key);
  return {action:"IMPROVE_CHANNEL_1" as const,readiness,strategy,draft,externalActionsExecuted:0};
 }
 const title="ToolKlar · Channel #2 Launch Kit";
 const draft=await insertOnce(title,{personaId:"toolklar-editorial",platform:"youtube/shorts/instagram/tiktok",topic:"ROI-orientierte KI- und SaaS-Tooltests für kleine Unternehmen",content:"Kanal #1 hat das 80%-Standardisierungs- und Qualitätsgate bestanden. Übernehme nur wiederverwendbare Produktionsmodule; Hook, Voice, visuelle Grammatik, Beispiele, Thumbnail und Plattform-Cuts müssen ToolKlar-spezifisch neu entstehen.",assets:[],assetCount:0,disclosure:"Launch-Kit bleibt Pending; Handles, Konten, Publishing, Affiliate-Anmeldung und Spend sind externe Freigabeaktionen.",channel:"ToolKlar",format:"channel-launch-kit",identity:strategy.channelPortfolio.find(x=>x.key==="toolklar")?.identity,productionSystem:strategy.productionPipeline,externalAction:"approval-required"}, "toolklar-launch-v1");
 return {action:"PREPARE_CHANNEL_2" as const,readiness,strategy,draft,externalActionsExecuted:0};
}

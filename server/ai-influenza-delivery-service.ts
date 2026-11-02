import {eq} from "drizzle-orm";
import {b2bNetworkNodes,revenueJobs} from "../drizzle/schema";
import {aiInfluenzaCreativePrompt,buildAiInfluenzaDeliveryBriefs} from "../lib/ai-influenza-delivery-logic";
import {packageForStripeMetadata,type AiInfluenzaOrderPayload} from "../lib/ai-influenza-team-logic";
import {getDb} from "./db";
import {insertPendingDraft} from "./draft-engine";
import {invokeLLM} from "./_core/llm";
import {aiInfluenzaTaskCostEventKey,estimateAiInfluenzaUsageCost} from "../lib/ai-influenza-cost-logic";
import {recordAiInfluenzaCost} from "./ai-influenza-profit-service";

type TaskPayload={
  businessUnit:string;orderId:string;packageId:string;customerNodeKey:string;
  taskKind:string;quantity:number;ownerAgent:string;requiresExternalApproval:boolean;mode:string;
};

export async function aiInfluenzaDeliveryPlan(orderId:string){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [orderRow]=await db.select().from(revenueJobs).where(eq(revenueJobs.dedupeKey,`ai-influenza-order:${orderId}`)).limit(1);
  if(!orderRow)throw new Error("AI-Influenza-Auftrag nicht gefunden.");
  const order=orderRow.payload as AiInfluenzaOrderPayload;
  return {order,briefs:buildAiInfluenzaDeliveryBriefs(order.packageId)};
}

export async function generateAiInfluenzaTaskDraft(taskJobId:number){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [task]=await db.select().from(revenueJobs).where(eq(revenueJobs.id,taskJobId)).limit(1);
  if(!task||task.kind!=="ai-influenza-task")throw new Error("AI-Influenza-Delivery-Task nicht gefunden.");
  if(task.status==="completed"&&(task.result as Record<string,unknown>|null)?.draftGenerated===true){
    return {reused:true,taskId:task.id,result:task.result};
  }
  const payload=task.payload as TaskPayload;
  if(payload.businessUnit!=="ai-influenza-team")throw new Error("Task gehört nicht zur AI-Influenza-Business-Unit.");
  const packageId=packageForStripeMetadata(payload.packageId);
  if(!packageId)throw new Error("Ungültiges Servicepaket.");
  const [customer]=await db.select().from(b2bNetworkNodes).where(eq(b2bNetworkNodes.nodeKey,payload.customerNodeKey)).limit(1);
  if(!customer)throw new Error("Kunde für Delivery-Task nicht gefunden.");
  const prompt=aiInfluenzaCreativePrompt({
    companyName:customer.name,packageId,taskKind:payload.taskKind,quantity:payload.quantity,
  });
  const llm=await invokeLLM({
    messages:[
      {role:"system",content:"Erstelle nur belastbare, veröffentlichungsreife Marketing-Arbeitsentwürfe. Keine erfundenen Resultate oder Testimonials."},
      {role:"user",content:prompt},
    ],
    maxTokens:1400,
  });
  const text=llm.choices[0]?.message?.content;
  if(typeof text!=="string"||!text.trim())throw new Error("LLM lieferte keinen Delivery-Entwurf.");
  const brief=buildAiInfluenzaDeliveryBriefs(packageId).find(x=>x.taskKind===payload.taskKind);
  const topic=`AI Influenza Team · ${customer.name} · ${payload.taskKind}`;
  await insertPendingDraft("content",topic,{
    personaId:payload.ownerAgent,
    platform:brief?.channel??"multi-channel",
    topic,
    content:text.trim().slice(0,4000),
    disclosure:"KI-gestützter Agenturentwurf; externe Veröffentlichung erst nach menschlicher Freigabe.",
    assets:[{
      format:brief?.format??payload.taskKind,
      variant:1,
      title:topic,
      content:text.trim().slice(0,12000),
      qualityReason:"Paket-/Kundenbriefing mit Truthfulness- und Freigabe-Gate.",
    }],
    assetCount:1,
  },"ai-influenza-team");
  // Sprint 2: tatsaechlichen Verbrauch in Cent umrechnen. Unbekanntes Modell
  // oder fehlender Verbrauch -> keine Zahl, sondern der Grund im Ergebnis.
  const cost=estimateAiInfluenzaUsageCost({model:llm.model,usage:llm.usage??null});
  const result={
    draftGenerated:true,
    packageId,
    taskKind:payload.taskKind,
    channel:brief?.channel??"multi-channel",
    renderPipeline:brief?.renderPipeline??"draft-only",
    generatedAt:new Date().toISOString(),
    usage:llm.usage??null,
    llmCost:cost
      ?{cents:cost.cents,basis:cost.basis,model:cost.model,promptTokens:cost.promptTokens,completionTokens:cost.completionTokens}
      :{cents:null,basis:"nicht messbar: Modell oder Verbrauch unbekannt",model:llm.model??null},
  };
  await db.update(revenueJobs).set({status:"completed",result,attempts:task.attempts+1,lastError:null,updatedAt:new Date()}).where(eq(revenueJobs.id,task.id));
  if(cost){
    try{
      await recordAiInfluenzaCost({
        orderId:payload.orderId,category:"llm",amountCents:cost.cents,
        note:`Task ${task.id} · ${cost.model} · ${cost.promptTokens}/${cost.completionTokens} Token`,
        actorOpenId:"system:ai-influenza-team",
        eventKey:aiInfluenzaTaskCostEventKey(payload.orderId,task.id),
      });
    }catch{
      // Die Kostenbuchung darf eine fertige Lieferung nicht scheitern lassen.
    }
  }
  return {reused:false,taskId:task.id,result};
}

export async function aiInfluenzaDeliveryStatus(orderId:string){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const tasks=await db.select().from(revenueJobs).where(eq(revenueJobs.kind,"ai-influenza-task")).limit(500);
  const own=tasks.filter(row=>(row.payload as TaskPayload).orderId===orderId);
  return {
    orderId,
    total:own.length,
    queued:own.filter(x=>x.status==="queued").length,
    completed:own.filter(x=>x.status==="completed").length,
    blocked:own.filter(x=>x.status==="blocked").length,
    tasks:own,
  };
}

import {desc,eq,gte} from "drizzle-orm";
import {revenueAttributionEvents,revenueCostEvents,revenueJobs} from "../drizzle/schema";
import {calculateAiInfluenzaUnitEconomics,type AiInfluenzaOrderPayload} from "../lib/ai-influenza-team-logic";
import {getDb} from "./db";

export async function recordAiInfluenzaCost(input:{
  orderId:string;
  category:"llm"|"media"|"delivery"|"tooling"|"refund"|"other";
  amountCents:number;
  note?:string;
  actorOpenId:string;
  /**
   * Sprint 2: optionaler, deterministischer Event-Key. Damit ist die
   * automatische Token-Kostenbuchung idempotent — ein Wiederholungslauf
   * erzeugt keine zweite Kostenzeile.
   */
  eventKey?:string;
}){
  if(!Number.isInteger(input.amountCents)||input.amountCents<0)throw new Error("Kostenbetrag muss in nichtnegativen Cent angegeben werden.");
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const eventKey=input.eventKey?.trim()||`ai-influenza-cost:${input.orderId}:${crypto.randomUUID()}`;
  const [row]=await db.insert(revenueCostEvents).values({
    eventKey,
    category:input.category,
    amountCents:input.amountCents,
    metadata:{
      businessUnit:"ai-influenza-team",
      orderId:input.orderId,
      note:input.note?.trim().slice(0,300)??null,
      actorOpenId:input.actorOpenId,
    },
  }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function aiInfluenzaProfitOverview(windowDays=30){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const since=new Date(Date.now()-Math.max(1,Math.min(365,windowDays))*86_400_000);
  const [revenues,costs]=await Promise.all([
    db.select().from(revenueAttributionEvents)
      .where(gte(revenueAttributionEvents.occurredAt,since))
      .orderBy(desc(revenueAttributionEvents.occurredAt)).limit(5000),
    db.select().from(revenueCostEvents)
      .where(gte(revenueCostEvents.occurredAt,since))
      .orderBy(desc(revenueCostEvents.occurredAt)).limit(5000),
  ]);
  const agencyRevenue=revenues.filter(row=>row.personaId==="ai-influenza-team"&&row.platform==="stripe"&&row.eventType==="purchase");
  const agencyCosts=costs.filter(row=>(row.metadata as Record<string,unknown>|null)?.businessUnit==="ai-influenza-team");
  const recognizedRevenueCents=agencyRevenue.reduce((sum,row)=>sum+Math.max(0,row.valueCents),0);
  const deliveryCostCents=agencyCosts.filter(row=>["media","delivery","tooling","other"].includes(row.category)).reduce((sum,row)=>sum+Math.max(0,row.amountCents),0);
  const apiCostCents=agencyCosts.filter(row=>row.category==="llm").reduce((sum,row)=>sum+Math.max(0,row.amountCents),0);
  const refundCents=agencyCosts.filter(row=>row.category==="refund").reduce((sum,row)=>sum+Math.max(0,row.amountCents),0);
  return {
    windowDays,
    ...calculateAiInfluenzaUnitEconomics({recognizedRevenueCents,deliveryCostCents,apiCostCents,refundCents}),
    revenueEvents:agencyRevenue.length,
    costEvents:agencyCosts.length,
    source:"verified-stripe-invoices-minus-recorded-cost-events" as const,
  };
}

export async function aiInfluenzaCustomerReport(orderId:string){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [orderRow]=await db.select().from(revenueJobs).where(eq(revenueJobs.dedupeKey,`ai-influenza-order:${orderId}`)).limit(1);
  if(!orderRow)throw new Error("Auftrag nicht gefunden.");
  const order=orderRow.payload as AiInfluenzaOrderPayload;
  const [tasks,events,costs,revenues]=await Promise.all([
    db.select().from(revenueJobs).where(eq(revenueJobs.kind,"ai-influenza-task")).limit(1000),
    db.select().from(revenueJobs).where(eq(revenueJobs.kind,"ai-influenza-event")).limit(1000),
    db.select().from(revenueCostEvents).limit(5000),
    db.select().from(revenueAttributionEvents).limit(5000),
  ]);
  const ownTasks=tasks.filter(row=>(row.payload as Record<string,unknown>).orderId===orderId);
  const ownEvents=events.filter(row=>(row.payload as Record<string,unknown>).orderId===orderId);
  const ownCosts=costs.filter(row=>(row.metadata as Record<string,unknown>|null)?.orderId===orderId);
  const ownRevenue=revenues.filter(row=>row.personaId==="ai-influenza-team"&&row.contentId===orderId&&row.eventType==="purchase");
  const recognizedRevenueCents=ownRevenue.reduce((s,x)=>s+Math.max(0,x.valueCents),0);
  const totalCostCents=ownCosts.reduce((s,x)=>s+Math.max(0,x.amountCents),0);
  const completed=ownTasks.filter(x=>x.status==="completed").length;
  return {
    orderId,
    packageId:order.packageId,
    workflowStep:order.step,
    paymentStatus:order.paymentStatus,
    delivery:{total:ownTasks.length,completed,open:ownTasks.length-completed,completionPct:ownTasks.length?Number((completed/ownTasks.length*100).toFixed(1)):0},
    financials:{recognizedRevenueCents,totalCostCents,contributionCents:recognizedRevenueCents-totalCostCents},
    events:ownEvents.length,
    generatedAt:new Date().toISOString(),
    truthNote:"Revenue basiert nur auf verifizierten Stripe-Invoice-Events; Kosten basieren nur auf erfassten Cost-Events.",
  };
}

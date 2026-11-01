import {and,desc,eq,sql} from "drizzle-orm";
import {b2bNetworkNodes,revenueJobs} from "../drizzle/schema";
import {
  AI_INFLUENZA_PACKAGES,
  buildAiInfluenzaMonthlyPlan,
  canAdvanceAiInfluenzaStep,
  nextAiInfluenzaStep,
  type AiInfluenzaMode,
  type AiInfluenzaOrderPayload,
  type AiInfluenzaPackageId,
} from "../lib/ai-influenza-team-logic";
import {getDb} from "./db";
import {upsertB2BNode} from "./growth-network-service";

function parseOrderPayload(value:unknown):AiInfluenzaOrderPayload{
  if(!value||typeof value!=="object")throw new Error("Ungültiger AI-Influenza-Auftrag.");
  const p=value as Partial<AiInfluenzaOrderPayload>;
  if(p.businessUnit!=="ai-influenza-team"||typeof p.orderId!=="string"||typeof p.customerNodeKey!=="string"||typeof p.packageId!=="string"||typeof p.step!=="string"||typeof p.createdByOpenId!=="string"){
    throw new Error("Unvollständiger AI-Influenza-Auftrag.");
  }
  return p as AiInfluenzaOrderPayload;
}

export async function createAiInfluenzaOrder(input:{
  customerNodeKey:string;
  packageId:AiInfluenzaPackageId;
  mode?:AiInfluenzaMode;
  createdByOpenId:string;
  monthlyBudgetCents?:number;
  testOnly?:boolean;
}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [customer]=await db.select().from(b2bNetworkNodes).where(eq(b2bNetworkNodes.nodeKey,input.customerNodeKey)).limit(1);
  if(!customer)throw new Error("B2B-Kunde/Lead wurde nicht gefunden.");
  if(customer.optedOut)throw new Error("Opt-out-Kontakt darf nicht in einen aktiven Sales-/Delivery-Auftrag übernommen werden.");
  const pkg=AI_INFLUENZA_PACKAGES[input.packageId];
  const orderId=`ait-${crypto.randomUUID()}`;
  const payload:AiInfluenzaOrderPayload={
    businessUnit:"ai-influenza-team",
    orderId,
    customerNodeKey:customer.nodeKey,
    packageId:pkg.id,
    mode:input.mode??"assisted",
    step:"market-analysis",
    monthlyBudgetCents:Math.max(0,input.monthlyBudgetCents??Math.round(pkg.monthlyPriceCents*.35)),
    paymentStatus:input.testOnly?"test-only":"not-started",
    stripeSubscriptionId:null,
    testOnly:Boolean(input.testOnly),
    createdByOpenId:input.createdByOpenId,
  };
  const [job]=await db.insert(revenueJobs).values({
    dedupeKey:`ai-influenza-order:${orderId}`,
    kind:"ai-influenza-order",
    status:"queued",
    payload,
  }).returning();
  await db.insert(revenueJobs).values({
    dedupeKey:`ai-influenza-event:${orderId}:created`,
    kind:"ai-influenza-event",
    status:"completed",
    payload:{businessUnit:"ai-influenza-team",orderId,event:"created",step:payload.step,at:new Date().toISOString()},
  }).onConflictDoNothing({target:revenueJobs.dedupeKey});
  return {job,payload,package:pkg};
}


export async function ensureAiInfluenzaCustomerNode(input:{
  openId:string;name:string|null;email:string|null;packageId:AiInfluenzaPackageId;
}){
  const pkg=AI_INFLUENZA_PACKAGES[input.packageId];
  return upsertB2BNode({
    nodeKey:`ccc-user:${input.openId}`,
    kind:"customer",
    name:input.name?.trim()||"CyberSarah Kunde",
    fit:100,intent:100,trust:60,relationshipStrength:35,
    estimatedValueCents:pkg.monthlyPriceCents,
    optedOut:false,
    metadata:{
      businessUnit:"ai-influenza-team",
      source:"authenticated-inbound-checkout",
      contactBasis:"customer-initiated",
      accountEmailPresent:Boolean(input.email),
      packageId:input.packageId,
    },
  });
}

export async function createAiInfluenzaInboundOrder(input:{
  customerNodeKey:string;
  packageId:AiInfluenzaPackageId;
  createdByOpenId:string;
}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [customer]=await db.select().from(b2bNetworkNodes).where(eq(b2bNetworkNodes.nodeKey,input.customerNodeKey)).limit(1);
  if(!customer)throw new Error("B2B-Kunde wurde nicht gefunden.");
  if(customer.optedOut)throw new Error("Opt-out-Kontakt darf keinen aktiven Auftrag erhalten.");
  const pkg=AI_INFLUENZA_PACKAGES[input.packageId];
  const orderId=`ait-${crypto.randomUUID()}`;
  const payload:AiInfluenzaOrderPayload={
    businessUnit:"ai-influenza-team",
    orderId,customerNodeKey:customer.nodeKey,packageId:pkg.id,mode:"assisted",
    step:"payment-pending",monthlyBudgetCents:Math.round(pkg.monthlyPriceCents*.35),
    paymentStatus:"pending",stripeSubscriptionId:null,testOnly:false,createdByOpenId:input.createdByOpenId,
  };
  const [job]=await db.insert(revenueJobs).values({
    dedupeKey:`ai-influenza-order:${orderId}`,kind:"ai-influenza-order",status:"queued",payload,
  }).returning();
  await db.insert(revenueJobs).values({
    dedupeKey:`ai-influenza-event:${orderId}:inbound-checkout`,kind:"ai-influenza-event",status:"completed",
    payload:{businessUnit:"ai-influenza-team",orderId,event:"inbound-checkout-created",step:"payment-pending",at:new Date().toISOString()},
  }).onConflictDoNothing({target:revenueJobs.dedupeKey});
  return {job,payload,package:pkg};
}

export async function listAiInfluenzaOrders(limit=100){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const rows=await db.select().from(revenueJobs)
    .where(eq(revenueJobs.kind,"ai-influenza-order"))
    .orderBy(desc(revenueJobs.updatedAt))
    .limit(Math.max(1,Math.min(500,limit)));
  return rows.map(row=>({...row,order:parseOrderPayload(row.payload)}));
}

export async function enqueueAiInfluenzaDeliveryTasks(order:AiInfluenzaOrderPayload){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const plan=buildAiInfluenzaMonthlyPlan(order.packageId);
  let created=0,reused=0;
  for(const item of plan){
    const [row]=await db.insert(revenueJobs).values({
      dedupeKey:`ai-influenza-task:${order.orderId}:${item.sequence}:${item.taskKind}`,
      kind:"ai-influenza-task",
      status:"queued",
      payload:{
        businessUnit:"ai-influenza-team",
        orderId:order.orderId,
        packageId:order.packageId,
        customerNodeKey:order.customerNodeKey,
        taskKind:item.taskKind,
        quantity:item.quantity,
        ownerAgent:item.ownerAgent,
        requiresExternalApproval:item.requiresExternalApproval,
        mode:order.mode,
      },
    }).onConflictDoNothing({target:revenueJobs.dedupeKey}).returning({id:revenueJobs.id});
    if(row)created+=1;else reused+=1;
  }
  return {created,reused,total:plan.length};
}

export async function advanceAiInfluenzaOrder(input:{
  jobId:number;
  approved:boolean;
  estimatedCostCents?:number;
}){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.jobId})`);
    const [row]=await tx.select().from(revenueJobs)
      .where(and(eq(revenueJobs.id,input.jobId),eq(revenueJobs.kind,"ai-influenza-order"))).limit(1);
    if(!row)throw new Error("AI-Influenza-Auftrag nicht gefunden.");
    const order=parseOrderPayload(row.payload);
    const next=nextAiInfluenzaStep(order.step);
    if(!next)throw new Error("Auftrag befindet sich bereits im letzten Workflow-Schritt.");
    if(next==="paid"&&!order.testOnly){
      throw new Error("Der Status 'paid' darf für echte Aufträge nur aus einem verifizierten Stripe-Zahlungs-/Subscription-Event gesetzt werden.");
    }
    const decision=canAdvanceAiInfluenzaStep({
      mode:order.mode,from:order.step,to:next,approved:input.approved,
      budgetCents:order.monthlyBudgetCents,estimatedCostCents:Math.max(0,input.estimatedCostCents??0),
    });
    if(!decision.allowed)throw new Error(decision.reason);
    const updated:AiInfluenzaOrderPayload={...order,step:next};
    await tx.update(revenueJobs).set({
      payload:updated,status:next==="renewal"?"completed":"queued",
      attempts:sql`${revenueJobs.attempts} + 1`,updatedAt:new Date(),
    }).where(eq(revenueJobs.id,row.id));
    await tx.insert(revenueJobs).values({
      dedupeKey:`ai-influenza-event:${order.orderId}:${order.step}:${next}:${row.attempts+1}`,
      kind:"ai-influenza-event",status:"completed",
      payload:{businessUnit:"ai-influenza-team",orderId:order.orderId,event:"step-advanced",from:order.step,to:next,approved:input.approved,at:new Date().toISOString()},
    }).onConflictDoNothing({target:revenueJobs.dedupeKey});
    return {order:updated,from:order.step,to:next};
  });
}

export async function aiInfluenzaTeamOverview(){
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const [orders,tasks]=await Promise.all([
    db.select().from(revenueJobs).where(eq(revenueJobs.kind,"ai-influenza-order")).orderBy(desc(revenueJobs.updatedAt)).limit(200),
    db.select().from(revenueJobs).where(eq(revenueJobs.kind,"ai-influenza-task")).orderBy(desc(revenueJobs.updatedAt)).limit(500),
  ]);
  const parsed=orders.map(row=>({row,order:parseOrderPayload(row.payload)}));
  const counts=Object.fromEntries([
    ...new Set(parsed.map(x=>x.order.step)),
  ].map(step=>[step,parsed.filter(x=>x.order.step===step).length]));
  return {
    businessUnit:"AI Influenza Team" as const,
    defaultMode:"assisted" as const,
    packages:Object.values(AI_INFLUENZA_PACKAGES),
    counts:{orders:orders.length,tasks:tasks.length,steps:counts},
    recentOrders:parsed.slice(0,25),
    recentTasks:tasks.slice(0,50),
    safety:{externalActionsRequireApproval:true,livePaymentsNeverSimulated:true,pricingIsHypothesis:true},
  };
}

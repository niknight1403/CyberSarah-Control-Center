import Stripe from "stripe";
import {eq} from "drizzle-orm";
import {revenueAttributionEvents,revenueJobs} from "../drizzle/schema";
import {packageForStripeMetadata,type AiInfluenzaOrderPayload} from "../lib/ai-influenza-team-logic";
import {getDb} from "./db";
import {enqueueAiInfluenzaDeliveryTasks} from "./ai-influenza-team-service";

function subscriptionPaymentStatus(status:Stripe.Subscription.Status):AiInfluenzaOrderPayload["paymentStatus"]{
  if(status==="active"||status==="trialing")return "paid";
  if(status==="past_due"||status==="unpaid"||status==="incomplete")return "past-due";
  if(status==="canceled"||status==="incomplete_expired")return "cancelled";
  return "pending";
}

export async function syncAiInfluenzaSubscription(subscription:Stripe.Subscription){
  if(subscription.metadata?.businessUnit!=="ai-influenza-team")return {handled:false as const};
  const packageId=packageForStripeMetadata(subscription.metadata.packageId);
  const orderId=subscription.metadata.orderId?.trim();
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const paymentStatus=subscriptionPaymentStatus(subscription.status);
  await db.insert(revenueJobs).values({
    dedupeKey:`ai-influenza-subscription:${subscription.id}`,
    kind:"ai-influenza-subscription",
    status:paymentStatus==="paid"?"completed":paymentStatus==="cancelled"?"blocked":"queued",
    payload:{
      businessUnit:"ai-influenza-team",subscriptionId:subscription.id,
      packageId:packageId??subscription.metadata.packageId??null,
      orderId:orderId||null,paymentStatus,
      cancelAtPeriodEnd:subscription.cancel_at_period_end,
    },
  }).onConflictDoUpdate({
    target:revenueJobs.dedupeKey,
    set:{
      status:paymentStatus==="paid"?"completed":paymentStatus==="cancelled"?"blocked":"queued",
      payload:{
        businessUnit:"ai-influenza-team",subscriptionId:subscription.id,
        packageId:packageId??subscription.metadata.packageId??null,
        orderId:orderId||null,paymentStatus,
        cancelAtPeriodEnd:subscription.cancel_at_period_end,
      },
      updatedAt:new Date(),
    },
  });
  if(!orderId)return {handled:true as const,orderUpdated:false as const,paymentStatus};
  const [job]=await db.select().from(revenueJobs).where(eq(revenueJobs.dedupeKey,`ai-influenza-order:${orderId}`)).limit(1);
  if(!job)return {handled:true as const,orderUpdated:false as const,paymentStatus};
  const order=job.payload as AiInfluenzaOrderPayload;
  if(order.businessUnit!=="ai-influenza-team")return {handled:true as const,orderUpdated:false as const,paymentStatus};
  const shouldMarkPaid=paymentStatus==="paid"&&order.step==="payment-pending";
  const updated:AiInfluenzaOrderPayload={
    ...order,paymentStatus,stripeSubscriptionId:subscription.id,
    ...(shouldMarkPaid?{step:"paid" as const}:{}),
  };
  await db.update(revenueJobs).set({
    payload:updated,
    status:paymentStatus==="cancelled"?"blocked":shouldMarkPaid?"queued":job.status,
    updatedAt:new Date(),
  }).where(eq(revenueJobs.id,job.id));
  if(shouldMarkPaid)await enqueueAiInfluenzaDeliveryTasks(updated);
  return {handled:true as const,orderUpdated:true as const,paymentStatus,deliveryQueued:shouldMarkPaid};
}

function invoiceSubscriptionMetadata(invoice:Stripe.Invoice):Record<string,string>|null{
  const details=invoice.parent?.subscription_details as {metadata?:Record<string,string>}|null|undefined;
  return details?.metadata??null;
}

export async function recordAiInfluenzaInvoice(invoice:Stripe.Invoice){
  const metadata=invoiceSubscriptionMetadata(invoice);
  if(metadata?.businessUnit!=="ai-influenza-team")return {handled:false as const};
  const db=await getDb();if(!db)throw new Error("Datenbank nicht verfügbar.");
  const orderId=metadata.orderId?.trim()||null;
  const eventType=invoice.status==="paid"?"purchase":"invoice";
  if(invoice.status==="paid"&&invoice.amount_paid>0){
    await db.insert(revenueAttributionEvents).values({
      eventKey:`ai-influenza:stripe-invoice:${invoice.id}`,
      personaId:"ai-influenza-team",
      contentId:orderId??invoice.id,
      platform:"stripe",
      eventType,
      valueCents:invoice.amount_paid,
      occurredAt:invoice.status_transitions?.paid_at?new Date(invoice.status_transitions.paid_at*1000):new Date(),
    }).onConflictDoNothing({target:revenueAttributionEvents.eventKey});
  }
  return {handled:true as const,orderId,recognizedRevenueCents:invoice.status==="paid"?Math.max(0,invoice.amount_paid):0};
}

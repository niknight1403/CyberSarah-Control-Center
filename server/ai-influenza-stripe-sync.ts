import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { revenueAttributionEvents, revenueJobs } from "../drizzle/schema";
import {
  aiInfluenzaPaymentStatusForSubscriptionStatus,
  applyAiInfluenzaVerifiedInvoicePayment,
  packageForStripeMetadata,
  subscriptionHasVerifiedLatestPaidInvoice,
  type AiInfluenzaOrderPayload,
} from "../lib/ai-influenza-team-logic";
import { getDb } from "./db";
import { enqueueAiInfluenzaDeliveryTasks } from "./ai-influenza-team-service";

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export async function syncAiInfluenzaSubscription(subscription: Stripe.Subscription) {
  if (subscription.metadata?.businessUnit !== "ai-influenza-team") return { handled: false as const };
  const packageId = packageForStripeMetadata(subscription.metadata.packageId);
  const orderId = subscription.metadata.orderId?.trim();
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");

  // Ein Subscription-Status wie active oder trialing belegt keine Zahlung.
  const subscriptionStatusPayment = aiInfluenzaPaymentStatusForSubscriptionStatus(subscription.status);
  await db.insert(revenueJobs).values({
    dedupeKey: `ai-influenza-subscription:${subscription.id}`,
    kind: "ai-influenza-subscription",
    status: subscriptionStatusPayment === "cancelled" ? "blocked" : "queued",
    payload: {
      businessUnit: "ai-influenza-team",
      subscriptionId: subscription.id,
      packageId: packageId ?? subscription.metadata.packageId ?? null,
      orderId: orderId || null,
      paymentStatus: subscriptionStatusPayment,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  }).onConflictDoUpdate({
    target: revenueJobs.dedupeKey,
    set: {
      status: subscriptionStatusPayment === "cancelled" ? "blocked" : "queued",
      payload: {
        businessUnit: "ai-influenza-team",
        subscriptionId: subscription.id,
        packageId: packageId ?? subscription.metadata.packageId ?? null,
        orderId: orderId || null,
        paymentStatus: subscriptionStatusPayment,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      updatedAt: new Date(),
    },
  });

  if (!orderId) return { handled: true as const, orderUpdated: false as const, paymentStatus: subscriptionStatusPayment };
  const [job] = await db.select().from(revenueJobs)
    .where(eq(revenueJobs.dedupeKey, `ai-influenza-order:${orderId}`)).limit(1);
  if (!job || job.kind !== "ai-influenza-order") {
    return { handled: true as const, orderUpdated: false as const, paymentStatus: subscriptionStatusPayment };
  }

  const order = job.payload as AiInfluenzaOrderPayload;
  if (order.businessUnit !== "ai-influenza-team" || order.testOnly || order.paymentStatus === "test-only") {
    return { handled: true as const, orderUpdated: false as const, paymentStatus: subscriptionStatusPayment };
  }

  const latestInvoiceId = stripeObjectId(subscription.latest_invoice);
  const verifiedCurrentPayment = subscriptionHasVerifiedLatestPaidInvoice({
    subscriptionStatus: subscription.status,
    latestInvoiceId,
    lastPaidInvoiceId: order.lastPaidInvoiceId,
  });
  const paymentStatus = verifiedCurrentPayment ? "paid" : subscriptionStatusPayment;
  const shouldMarkPaid = verifiedCurrentPayment && order.step === "payment-pending";
  const updated: AiInfluenzaOrderPayload = {
    ...order,
    paymentStatus,
    stripeSubscriptionId: subscription.id,
    ...(shouldMarkPaid ? { step: "paid" as const } : {}),
  };
  await db.update(revenueJobs).set({
    payload: updated,
    status: subscriptionStatusPayment === "cancelled" ? "blocked" : shouldMarkPaid ? "queued" : job.status,
    updatedAt: new Date(),
  }).where(eq(revenueJobs.id, job.id));
  if (shouldMarkPaid) await enqueueAiInfluenzaDeliveryTasks(updated);
  return { handled: true as const, orderUpdated: true as const, paymentStatus, deliveryQueued: shouldMarkPaid };
}

function invoiceSubscriptionDetails(invoice: Stripe.Invoice) {
  return invoice.parent?.subscription_details as {
    metadata?: Record<string, string>;
    subscription?: string | { id?: string } | null;
  } | null | undefined;
}

export async function recordAiInfluenzaInvoice(invoice: Stripe.Invoice) {
  const details = invoiceSubscriptionDetails(invoice);
  const metadata = details?.metadata ?? null;
  if (metadata?.businessUnit !== "ai-influenza-team") return { handled: false as const };

  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");
  const orderId = metadata.orderId?.trim() || null;
  const isPositivePaidInvoice = invoice.status === "paid" && invoice.amount_paid > 0;

  if (isPositivePaidInvoice) {
    await db.insert(revenueAttributionEvents).values({
      eventKey: `ai-influenza:stripe-invoice:${invoice.id}`,
      personaId: "ai-influenza-team",
      contentId: orderId ?? invoice.id,
      platform: "stripe",
      eventType: "purchase",
      valueCents: invoice.amount_paid,
      occurredAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : new Date(),
    }).onConflictDoNothing({ target: revenueAttributionEvents.eventKey });
  }

  let orderUpdated = false;
  let deliveryQueued = false;
  const subscriptionId = stripeObjectId(details?.subscription);
  if (isPositivePaidInvoice && orderId && subscriptionId) {
    const [job] = await db.select().from(revenueJobs)
      .where(eq(revenueJobs.dedupeKey, `ai-influenza-order:${orderId}`)).limit(1);
    if (job?.kind === "ai-influenza-order") {
      const order = job.payload as AiInfluenzaOrderPayload;
      const payment = applyAiInfluenzaVerifiedInvoicePayment(order, {
        invoiceId: invoice.id,
        status: invoice.status,
        amountPaidCents: invoice.amount_paid,
        subscriptionId,
      });
      if (payment.applied && payment.order.businessUnit === "ai-influenza-team") {
        await db.update(revenueJobs).set({
          payload: payment.order,
          status: order.step === "payment-pending" ? "queued" : job.status,
          updatedAt: new Date(),
        }).where(eq(revenueJobs.id, job.id));
        orderUpdated = true;

        // Dedupe keys make retries safe if a later task insert fails after the order update.
        await enqueueAiInfluenzaDeliveryTasks(payment.order);
        deliveryQueued = true;

        const subscriptionKey = `ai-influenza-subscription:${subscriptionId}`;
        const [subscriptionJob] = await db.select().from(revenueJobs)
          .where(eq(revenueJobs.dedupeKey, subscriptionKey)).limit(1);
        if (subscriptionJob?.kind === "ai-influenza-subscription") {
          const previousPayload = subscriptionJob.payload && typeof subscriptionJob.payload === "object"
            ? subscriptionJob.payload as Record<string, unknown>
            : {};
          await db.update(revenueJobs).set({
            status: "completed",
            payload: { ...previousPayload, paymentStatus: "paid", lastPaidInvoiceId: invoice.id },
            updatedAt: new Date(),
          }).where(eq(revenueJobs.id, subscriptionJob.id));
        }
      }
    }
  }

  return {
    handled: true as const,
    orderId,
    recognizedRevenueCents: isPositivePaidInvoice ? invoice.amount_paid : 0,
    orderUpdated,
    deliveryQueued,
  };
}

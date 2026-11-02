/**
 * Sprint 25 — dauerhafte Webhook-Idempotenz.
 *
 * Die Entscheidung selbst liegt getestet in lib/stripe-event-idempotency-logic.
 * Dieser Baustein schreibt die Belege in Postgres, damit Neustart und parallele
 * Instanzen dieselbe Zustellung nicht doppelt verarbeiten. Faellt die Datenbank
 * aus, wird das ehrlich als "unbekannt" behandelt und der Aufrufer entscheidet
 * mit seinem In-Memory-Fallback weiter.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { stripeWebhookEvents } from "../drizzle/schema";
import {
  decideWebhookDelivery,
  type DeliveryDecision,
  type IncomingWebhookEvent,
  type WebhookEventRecord,
} from "../lib/stripe-event-idempotency-logic";

export interface ClaimResult {
  available: boolean;
  decision: DeliveryDecision;
}

function toRecord(row: typeof stripeWebhookEvents.$inferSelect): WebhookEventRecord {
  return {
    eventId: row.eventId,
    type: row.type,
    aggregateKey: row.aggregateKey,
    status: row.status as WebhookEventRecord["status"],
    receivedAtMs: row.receivedAt ? row.receivedAt.getTime() : Date.now(),
    processedAtMs: row.processedAt ? row.processedAt.getTime() : null,
    eventCreatedAtMs: row.eventCreatedAt ? row.eventCreatedAt.getTime() : null,
  };
}

/**
 * Meldet ein Event an. Nur "process" und "reclaim_stale" duerfen Seiteneffekte
 * ausloesen; alle anderen Entscheidungen beenden die Zustellung.
 */
export async function claimStripeWebhookEvent(event: IncomingWebhookEvent): Promise<ClaimResult> {
  const db = await getDb();
  if (!db) return { available: false, decision: "process" };

  const [priorRow] = await db
    .select()
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.eventId))
    .limit(1);
  const prior = priorRow ? toRecord(priorRow) : null;

  let lastProcessedEventCreatedAtMs: number | null = null;
  let lastProcessedAggregateKey: string | null = null;
  if (event.aggregateKey) {
    const [latest] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(and(eq(stripeWebhookEvents.aggregateKey, event.aggregateKey), eq(stripeWebhookEvents.status, "processed")))
      .orderBy(desc(stripeWebhookEvents.eventCreatedAt))
      .limit(1);
    if (latest?.eventCreatedAt) {
      lastProcessedEventCreatedAtMs = latest.eventCreatedAt.getTime();
      lastProcessedAggregateKey = event.aggregateKey;
    }
  }

  const decision = decideWebhookDelivery({
    event,
    prior,
    nowMs: Date.now(),
    lastProcessedEventCreatedAtMs,
    lastProcessedAggregateKey,
  });

  const now = new Date();
  if (!prior) {
    await db.insert(stripeWebhookEvents).values({
      eventId: event.eventId,
      type: event.type,
      aggregateKey: event.aggregateKey,
      status: decision === "process" || decision === "stale_out_of_order" ? "processing" : "processing",
      eventCreatedAt: event.createdAtMs === null ? null : new Date(event.createdAtMs),
      receivedAt: now,
      attempts: 1,
    }).onConflictDoNothing({ target: stripeWebhookEvents.eventId });
  } else if (decision === "retry" || decision === "reclaim_stale") {
    await db.update(stripeWebhookEvents).set({
      status: "processing",
      receivedAt: now,
      attempts: sql`${stripeWebhookEvents.attempts} + 1`,
      lastError: null,
    }).where(eq(stripeWebhookEvents.eventId, event.eventId));
  }

  return { available: true, decision };
}

export async function completeStripeWebhookEvent(eventId: string, note?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(stripeWebhookEvents).set({
    status: "processed",
    processedAt: new Date(),
    lastError: note ?? null,
  }).where(eq(stripeWebhookEvents.eventId, eventId));
}

export async function failStripeWebhookEvent(eventId: string, message: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(stripeWebhookEvents).set({
    status: "failed",
    lastError: message.slice(0, 500),
  }).where(eq(stripeWebhookEvents.eventId, eventId));
}

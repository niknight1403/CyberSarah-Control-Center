/**
 * Sprint 25 — dauerhafte Webhook-Idempotenz.
 *
 * Die Entscheidung selbst liegt getestet in lib/stripe-event-idempotency-logic.
 * Dieser Baustein schreibt die Belege in Postgres, damit Neustart und parallele
 * Instanzen dieselbe Zustellung nicht doppelt verarbeiten. Faellt die Datenbank
 * aus, wird das ehrlich als "unbekannt" behandelt und der Aufrufer entscheidet
 * mit seinem In-Memory-Fallback weiter.
 */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { stripeWebhookEvents } from "../drizzle/schema";
import {
  decideWebhookDelivery,
  pruneCutoffMs,
  resolveClaimAttempt,
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

  const nowMs = Date.now();
  const now = new Date(nowMs);

  // Wasserstand des Aggregats NUR fuer die Out-of-order-Pruefung.
  let lastProcessedEventCreatedAtMs: number | null = null;
  if (event.aggregateKey) {
    const [latest] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(and(eq(stripeWebhookEvents.aggregateKey, event.aggregateKey), eq(stripeWebhookEvents.status, "processed")))
      .orderBy(desc(stripeWebhookEvents.eventCreatedAt))
      .limit(1);
    if (latest?.eventCreatedAt) lastProcessedEventCreatedAtMs = latest.eventCreatedAt.getTime();
  }

  const outOfOrder = decideWebhookDelivery({
    event,
    prior: null,
    nowMs,
    lastProcessedEventCreatedAtMs,
    lastProcessedAggregateKey: event.aggregateKey,
  }) === "stale_out_of_order";

  // Atomarer Claim: nur wer den Datensatz schreibt, darf Seiteneffekte
  // ausloesen. Zwei parallele Zustellungen koennen damit nicht beide
  // "process" gewinnen (vorher: select, dann insert -> Doppelverarbeitung).
  const [claimedRow] = await db
    .insert(stripeWebhookEvents)
    .values({
      eventId: event.eventId,
      type: event.type,
      aggregateKey: event.aggregateKey,
      status: "processing",
      eventCreatedAt: event.createdAtMs === null ? null : new Date(event.createdAtMs),
      receivedAt: now,
      attempts: 1,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
    .returning({ eventId: stripeWebhookEvents.eventId });

  await pruneStripeWebhookEvents(db, nowMs);

  if (outOfOrder) {
    // Beleg anlegen, aber niemals anwenden.
    await completeStripeWebhookEvent(event.eventId, "stale_out_of_order");
    return { available: true, decision: "stale_out_of_order" };
  }

  if (claimedRow) return { available: true, decision: "process" };

  // Claim verloren: Zustand neu lesen und ehrlich entscheiden.
  const [priorRow] = await db
    .select()
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.eventId))
    .limit(1);
  const prior = priorRow ? toRecord(priorRow) : null;
  const decision = resolveClaimAttempt({ claimed: false, prior, nowMs });

  if (decision === "retry" || decision === "reclaim_stale") {
    // Uebernahme nur, wenn der Zustand unveraendert ist.
    const taken = await db
      .update(stripeWebhookEvents)
      .set({ status: "processing", receivedAt: now, attempts: sql`${stripeWebhookEvents.attempts} + 1`, lastError: null })
      .where(and(
        eq(stripeWebhookEvents.eventId, event.eventId),
        eq(stripeWebhookEvents.status, prior?.status ?? "failed"),
        eq(stripeWebhookEvents.receivedAt, priorRow?.receivedAt ?? now),
      ))
      .returning({ eventId: stripeWebhookEvents.eventId });
    return { available: true, decision: taken.length > 0 ? "process" : "concurrent_retry" };
  }

  return { available: true, decision };
}

/**
 * Entfernt verarbeitete Belege nach der Aufbewahrungsfrist, damit die Tabelle
 * nicht unbegrenzt waechst. Fehler hier duerfen die Zustellung nicht stoppen.
 */
async function pruneStripeWebhookEvents(db: Awaited<ReturnType<typeof getDb>>, nowMs: number): Promise<void> {
  if (!db) return;
  try {
    const cutoff = new Date(pruneCutoffMs(nowMs));
    await db.delete(stripeWebhookEvents).where(and(
      eq(stripeWebhookEvents.status, "processed"),
      lt(stripeWebhookEvents.processedAt, cutoff),
    ));
  } catch {
    // Aufraeumen ist Hygiene, nicht Zustellkritisch.
  }
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

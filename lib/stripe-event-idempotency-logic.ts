/**
 * Sprint 25 - Webhook-Wiederholungen bei Bestellung/Refund idempotent verarbeiten.
 *
 * Reine Logik, keine Seiteneffekte, keine Stripe-Aufrufe.
 *
 * Anlass: Die bisherige Dedupe lag ausschliesslich in einem In-Memory-Set.
 * Nach einem Neustart oder bei parallelen Instanzen wurde dasselbe Event
 * erneut verarbeitet; ausserdem konnte ein spaeter zugestelltes, aelteres
 * `customer.subscription.updated` einen neueren Zustand ueberschreiben.
 *
 * Grundsaetze:
 * - Ein Event gilt erst als verarbeitet, wenn der Verarbeiter das bestaetigt.
 * - Unbekannt ist nicht erfolgreich: fehlende Belege fuehren zu "retry",
 *   niemals zu "duplicate_skip".
 * - Refunds sind kumulativ und gedeckelt: mehrfach zugestellte Refund-Events
 *   duerfen den Umsatz nicht mehrfach mindern.
 */

export type WebhookEventStatus = "processing" | "processed" | "failed";

export interface WebhookEventRecord {
  eventId: string;
  type: string;
  aggregateKey: string | null;
  status: WebhookEventStatus;
  receivedAtMs: number;
  processedAtMs: number | null;
  /** Erstellzeit des Events bei Stripe (ms); `null` wenn unbekannt. */
  eventCreatedAtMs: number | null;
}

export interface IncomingWebhookEvent {
  eventId: string;
  type: string;
  aggregateKey: string | null;
  createdAtMs: number | null;
}

export type DeliveryDecision =
  | "process"
  | "duplicate_skip"
  | "concurrent_retry"
  | "reclaim_stale"
  | "retry"
  | "stale_out_of_order";

export const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** Aggregat, auf das ein Event wirkt - Grundlage der Reihenfolgepruefung. */
export function webhookAggregateKey(event: { type: string; object: Record<string, unknown> }): string | null {
  const object = event.object;
  const asId = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  if (event.type.startsWith("customer.subscription.")) return asId(object.id) && `subscription:${asId(object.id)}`;
  if (event.type.startsWith("invoice.")) return asId(object.id) ? `invoice:${asId(object.id)}` : null;
  if (event.type.startsWith("charge.") || event.type.startsWith("refund.")) {
    const charge = asId(object.charge) ?? asId(object.id);
    return charge ? `charge:${charge}` : null;
  }
  if (event.type === "checkout.session.completed") {
    const session = asId(object.id);
    return session ? `checkout:${session}` : null;
  }
  return null;
}

/**
 * Entscheidet, was mit einer Zustellung geschieht. `prior` ist der bereits
 * gespeicherte Datensatz desselben Events (aus der Datenbank), nicht der
 * In-Memory-Zustand.
 */
export function decideWebhookDelivery(input: {
  event: IncomingWebhookEvent;
  prior: WebhookEventRecord | null;
  nowMs: number;
  /** Letzter verarbeiteter Event-Zeitstempel desselben Aggregats. */
  lastProcessedEventCreatedAtMs?: number | null;
  /** Aggregat, zu dem dieser Zeitstempel gehoert (Pflicht fuer den Vergleich). */
  lastProcessedAggregateKey?: string | null;
}): DeliveryDecision {
  const { event, prior, nowMs } = input;

  if (prior) {
    if (prior.status === "processed") return "duplicate_skip";
    if (prior.status === "failed") return "retry";
    // status "processing"
    return nowMs - prior.receivedAtMs >= STALE_PROCESSING_MS ? "reclaim_stale" : "concurrent_retry";
  }

  // Kein Datensatz: Out-of-order erkennen, aber niemals einen neueren Zustand
  // durch ein aelteres Event ueberschreiben.
  const sameAggregate =
    event.aggregateKey !== null &&
    typeof input.lastProcessedAggregateKey === "string" &&
    input.lastProcessedAggregateKey === event.aggregateKey;
  if (
    sameAggregate &&
    typeof input.lastProcessedEventCreatedAtMs === "number" &&
    typeof event.createdAtMs === "number" &&
    event.createdAtMs < input.lastProcessedEventCreatedAtMs
  ) {
    return "stale_out_of_order";
  }

  return "process";
}

export interface RefundIdempotencyInput {
  /** Bereits gebuchte Refunds fuer diese Charge in Minor Units. */
  refundedTotalMinor: number;
  /** Neue, zu buchende Refundsumme. */
  newRefundMinor: number;
  /** Urspruenglicher Zahlbetrag der Charge. */
  chargeAmountMinor: number;
  /** Bereits verarbeitete Event-IDs (Replay-Schutz). */
  processedEventIds?: readonly string[];
  eventId?: string;
}

export interface RefundIdempotencyResult {
  acceptedMinor: number;
  duplicate: boolean;
  capped: boolean;
  fullyRefunded: boolean;
}

/**
 * Bucht einen Refund genau einmal. Doppelte Event-IDs werden verworfen,
 * Ueberbuchungen werden auf den Restbetrag gedeckelt.
 */
export function applyRefundIdempotency(input: RefundIdempotencyInput): RefundIdempotencyResult {
  const refunded = Math.max(0, Math.trunc(input.refundedTotalMinor));
  const charge = Math.max(0, Math.trunc(input.chargeAmountMinor));
  const requested = Math.max(0, Math.trunc(input.newRefundMinor));
  const alreadyProcessed =
    input.eventId !== undefined &&
    Array.isArray(input.processedEventIds) &&
    input.processedEventIds.includes(input.eventId);

  if (alreadyProcessed || requested === 0) {
    return {
      acceptedMinor: 0,
      duplicate: alreadyProcessed,
      capped: false,
      fullyRefunded: charge > 0 && refunded >= charge,
    };
  }

  const remaining = Math.max(0, charge - refunded);
  const acceptedMinor = Math.min(requested, remaining);
  return {
    acceptedMinor,
    duplicate: false,
    capped: acceptedMinor < requested,
    fullyRefunded: charge > 0 && refunded + acceptedMinor >= charge,
  };
}

/** Fasst Event-Zaehlung fuer Betriebsanzeigen zusammen (ohne Erfolgsbehauptung). */
export function summarizeWebhookDeliveries(records: readonly WebhookEventRecord[]): {
  total: number;
  processed: number;
  failed: number;
  inFlight: number;
  staleInFlight: number;
  note: string;
} {
  const processed = records.filter(record => record.status === "processed").length;
  const failed = records.filter(record => record.status === "failed").length;
  const inFlight = records.filter(record => record.status === "processing").length;
  const now = Date.now();
  const staleInFlight = records.filter(
    record => record.status === "processing" && now - record.receivedAtMs >= STALE_PROCESSING_MS,
  ).length;
  const note = records.length === 0
    ? "Noch keine Webhook-Zustellungen im Belegzeitraum."
    : staleInFlight > 0
      ? `${staleInFlight} Zustellung(en) haengen laenger als ${Math.round(STALE_PROCESSING_MS / 60000)} Minuten und gelten als abgebrochen; erneute Zustellung ist erlaubt.`
      : "Alle laufenden Zustellungen liegen innerhalb des Verarbeitungsfensters.";
  return { total: records.length, processed, failed, inFlight, staleInFlight, note };
}

/**
 * Ergebnis eines atomaren Claims: Wer den Datensatz zuerst schreibt, darf
 * verarbeiten. Ein verlorener Claim fuehrt NIE zu doppelter Verarbeitung.
 */
export function resolveClaimAttempt(input: {
  claimed: boolean;
  prior: WebhookEventRecord | null;
  nowMs: number;
}): DeliveryDecision {
  if (input.claimed) return "process";
  const prior = input.prior;
  // Race ohne lesbaren Beleg: lieber erneut zustellen lassen als doppelt buchen.
  if (!prior) return "concurrent_retry";
  if (prior.status === "processed") return "duplicate_skip";
  if (prior.status === "failed") return "retry";
  return input.nowMs - prior.receivedAtMs >= STALE_PROCESSING_MS
    ? "reclaim_stale"
    : "concurrent_retry";
}

/** Aufbewahrung der Webhook-Belege; aeltere verarbeitete Eintraege werden entfernt. */
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;

export function pruneCutoffMs(nowMs: number, retentionDays = WEBHOOK_EVENT_RETENTION_DAYS): number {
  const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : WEBHOOK_EVENT_RETENTION_DAYS;
  return nowMs - days * 24 * 60 * 60 * 1000;
}

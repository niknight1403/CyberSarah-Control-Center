/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE WEBHOOK HANDLERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Production-ready Event-Verarbeitung mit:
 * - Event-Deduplizierung (verhindert Doppelverarbeitung bei Retries)
 * - Modulare Event-Router (switch-case mit Fallback)
 * - Vollständiges Audit-Logging
 * - Idempotente Transaktionsbuchung (onConflictDoNothing)
 * - Automatische Doppelzählungs-Vermeidung (Invoice vs PaymentIntent)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import Stripe from "stripe";
import { getStripeClient, getWebhookSecret } from "./stripeClient";
import { db } from "@workspace/db";
import { transactionsTable, webhookEventsTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Event-Deduplizierung ─────────────────────────────────────────────────────
// Verhindert Doppelverarbeitung bei Stripe-Retries oder schnellen
// aufeinanderfolgenden Events. Speichert nur Event-IDs (nicht Payloads).
const verarbeiteteEvents = new Set<string>();
const MAX_EVENTS_CACHE = 10_000;

function istBereitsVerarbeitet(eventId: string): boolean {
  if (verarbeiteteEvents.has(eventId)) return true;
  verarbeiteteEvents.add(eventId);
  // Cache-Größe begrenzen (älteste Einträge entfernen)
  if (verarbeiteteEvents.size > MAX_EVENTS_CACHE) {
    const ersteIds = Array.from(verarbeiteteEvents).slice(0, 1000);
    for (const id of ersteIds) verarbeiteteEvents.delete(id);
  }
  return false;
}

// ─── Audit-Logging: Jedes Webhook-Ereignis in DB schreiben ────────────────────

async function protokolliereWebhookEvent(params: {
  quelle: string;
  ereignisTyp?: string;
  externId?: string;
  payload?: unknown;
  signaturPruefung: boolean;
  signaturGueltig: boolean | null;
  verarbeitet: boolean;
  fehler?: string;
  ipAdresse?: string;
}): Promise<void> {
  if (!db) return;
  try {
    await db.insert(webhookEventsTable).values({
      quelle: params.quelle,
      ereignisTyp: params.ereignisTyp ?? null,
      externId: params.externId ?? null,
      payload: params.payload ?? null,
      signaturPruefung: params.signaturPruefung,
      signaturGueltig: params.signaturGueltig,
      verarbeitet: params.verarbeitet,
      fehler: params.fehler ?? null,
      ipAdresse: params.ipAdresse ?? null,
    });
  } catch (err) {
    // Audit-Logging darf den Webhook-Prozess NICHT blockieren
    logger.warn({ err }, "Webhook-Audit-Logging fehlgeschlagen");
  }
}

// ─── Transaktion in DB schreiben (idempotent) ──────────────────────────────────

async function schreibeTransaktion(params: {
  transaktionsId: string;
  stripeEventId?: string;
  quelle: string;
  typ: string;
  betrag: number;
  waehrung: string;
  beschreibung: string;
  metadaten?: Record<string, unknown>;
}): Promise<boolean> {
  if (!db) {
    logger.warn('Keine DB — Transaktion wird protokolliert aber nicht verbucht');
    return false;
  }
  const eingefügt = await db
    .insert(transactionsTable)
    .values({
      transaktionsId: params.transaktionsId,
      stripeEventId: params.stripeEventId,
      quelle: params.quelle,
      typ: params.typ,
      betrag: params.betrag.toString(),
      waehrung: params.waehrung.toUpperCase(),
      beschreibung: params.beschreibung,
      metadaten: JSON.stringify(params.metadaten ?? {}),
    })
    .onConflictDoNothing()
    .returning({ id: transactionsTable.id });

  return eingefügt.length > 0;
}

// ─── Prüft ob PaymentIntent zu einer Rechnung gehört ──────────────────────────
// Verhindert Doppelzählung: Abo-/Rechnungszahlungen werden über invoice.paid
// gebucht, nicht über payment_intent.succeeded.

async function gehörtZuRechnung(stripe: Stripe, pi: Stripe.PaymentIntent): Promise<boolean> {
  // Ältere API-Versionen: Feld direkt am PaymentIntent
  const altInvoiceRef = (pi as unknown as { invoice?: string | Stripe.Invoice | null }).invoice;
  if (altInvoiceRef) return true;

  // Neuere API-Versionen: Verknüpfung über InvoicePayments nachschlagen
  try {
    const zahlungen = await stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: pi.id },
      limit: 1,
    });
    return zahlungen.data.length > 0;
  } catch (err) {
    logger.warn({ err, paymentIntentId: pi.id }, "InvoicePayments-Lookup fehlgeschlagen");
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT-HANDLER (modular, erweiterbar)
// ═══════════════════════════════════════════════════════════════════════════════

type EventHandler = (event: Stripe.Event, ip: string) => Promise<void>;

const eventHandlers: Record<string, EventHandler> = {

  // ── checkout.session.completed ──────────────────────────────────────────
  "checkout.session.completed": async (event, ip) => {
    const session = event.data.object as Stripe.Checkout.Session;
    const betrag = session.amount_total ? session.amount_total / 100 : 0;

    // Doppelzählung vermeiden: PaymentIntent/Subscription → Buchung erfolgt
    // über das jeweilige Event
    if (session.payment_intent || session.subscription) {
      logger.info(
        { sessionId: session.id, betrag },
        "Checkout abgeschlossen — Buchung erfolgt über PaymentIntent/Invoice"
      );
      return;
    }

    await schreibeTransaktion({
      transaktionsId: session.id,
      stripeEventId: event.id,
      quelle: "Stripe",
      typ: "einnahme",
      betrag,
      waehrung: (session.currency ?? "eur").toUpperCase(),
      beschreibung: `Stripe Checkout: ${session.id}`,
      metadaten: {
        sessionId: session.id,
        customerId: session.customer,
        customerEmail: session.customer_details?.email,
      },
    });

    logger.info({ sessionId: session.id, betrag }, "Stripe Checkout in DB geschrieben");
  },

  // ── payment_intent.succeeded ────────────────────────────────────────────
  "payment_intent.succeeded": async (event, ip) => {
    const pi = event.data.object as Stripe.PaymentIntent;
    const betrag = pi.amount / 100;

    // Rechnungs-Zahlungen werden über invoice.paid gebucht
    if (await gehörtZuRechnung(getStripeClient(), pi)) {
      logger.info(
        { paymentIntentId: pi.id, betrag },
        "PaymentIntent gehört zu Rechnung — Buchung erfolgt über invoice.paid"
      );
      return;
    }

    await schreibeTransaktion({
      transaktionsId: pi.id,
      stripeEventId: event.id,
      quelle: "Stripe",
      typ: "einnahme",
      betrag,
      waehrung: (pi.currency ?? "eur").toUpperCase(),
      beschreibung: `Stripe Zahlung: ${pi.id}`,
      metadaten: { paymentIntentId: pi.id, customerId: pi.customer },
    });

    logger.info({ paymentIntentId: pi.id, betrag }, "PaymentIntent in DB geschrieben");
  },

  // ── payment_intent.payment_failed ───────────────────────────────────────
  "payment_intent.payment_failed": async (event, ip) => {
    const pi = event.data.object as Stripe.PaymentIntent;
    const fehler = pi.last_payment_error?.message ?? "Unbekannter Fehler";

    logger.error(
      {
        paymentIntentId: pi.id,
        fehler,
        betrag: pi.amount / 100,
        kunde: pi.customer,
      },
      "🚨 Stripe Zahlung FEHLGESCHLAGEN"
    );

    // Audit-Log für fehlgeschlagene Zahlungen
    await protokolliereWebhookEvent({
      quelle: "stripe",
      ereignisTyp: event.type,
      externId: event.id,
      payload: { paymentIntentId: pi.id, fehler, betrag: pi.amount / 100 },
      signaturPruefung: true,
      signaturGueltig: true,
      verarbeitet: true,
      ipAdresse: ip,
    });
  },

  // ── payment_method.attached ─────────────────────────────────────────────
  "payment_method.attached": async (event, ip) => {
    const pm = event.data.object as Stripe.PaymentMethod;
    logger.info(
      {
        paymentMethodId: pm.id,
        typ: pm.type,
        kunde: pm.customer,
        letzte4: pm.card?.last4,
      },
      "Stripe Payment Method angehängt"
    );
  },

  // ── customer.subscription.created ──────────────────────────────────────
  "customer.subscription.created": async (event, ip) => {
    const sub = event.data.object as Stripe.Subscription;
    logger.info(
      {
        subscriptionId: sub.id,
        status: sub.status,
        preis: sub.items.data[0]?.price?.id,
        kunde: sub.customer,
      },
      "Stripe Subscription erstellt"
    );
  },

  // ── customer.subscription.updated ──────────────────────────────────────
  "customer.subscription.updated": async (event, ip) => {
    const sub = event.data.object as Stripe.Subscription;
    logger.info(
      { subscriptionId: sub.id, status: sub.status },
      "Stripe Subscription aktualisiert"
    );
  },

  // ── customer.subscription.deleted ──────────────────────────────────────
  "customer.subscription.deleted": async (event, ip) => {
    const sub = event.data.object as Stripe.Subscription;
    logger.warn(
      { subscriptionId: sub.id, status: sub.status },
      "Stripe Subscription gekündigt"
    );
  },

  // ── customer.subscription.trial_will_end ───────────────────────────────
  "customer.subscription.trial_will_end": async (event, ip) => {
    const sub = event.data.object as Stripe.Subscription;
    const trialEnd = sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : "unbekannt";

    logger.warn(
      { subscriptionId: sub.id, trialEnd, kunde: sub.customer },
      "⚠️ Stripe Trial-Phase endet bald — Kunde informieren!"
    );

    // Hier könnte man eine E-Mail an den Kunden senden
  },

  // ── invoice.paid ────────────────────────────────────────────────────────
  "invoice.paid": async (event, ip) => {
    const invoice = event.data.object as Stripe.Invoice;
    const betrag = (invoice.amount_paid ?? 0) / 100;

    if (betrag > 0) {
      const neu = await schreibeTransaktion({
        transaktionsId: invoice.id ?? event.id,
        stripeEventId: event.id,
        quelle: "Stripe",
        typ: "einnahme",
        betrag,
        waehrung: (invoice.currency ?? "eur").toUpperCase(),
        beschreibung: `Stripe Rechnung bezahlt: ${invoice.id}`,
        metadaten: {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          periodeStart: invoice.period_start,
          periodeEnde: invoice.period_end,
        },
      });

      logger.info(
        { invoiceId: invoice.id, betrag, neu },
        "Invoice-Zahlung in DB geschrieben"
      );
    }
  },

  // ── invoice.payment_failed ──────────────────────────────────────────────
  "invoice.payment_failed": async (event, ip) => {
    const invoice = event.data.object as Stripe.Invoice;
    const fehler = invoice.last_finalization_error?.message ?? "Zahlung fehlgeschlagen";

    logger.error(
      {
        invoiceId: invoice.id,
        fehler,
        betrag: (invoice.amount_due ?? 0) / 100,
        kunde: invoice.customer,
      },
      "🚨 Stripe Rechnungszahlung FEHLGESCHLAGEN"
    );
  },

  // ── setup_intent.succeeded ──────────────────────────────────────────────
  "setup_intent.succeeded": async (event, ip) => {
    const si = event.data.object as Stripe.SetupIntent;
    logger.info(
      {
        setupIntentId: si.id,
        kunde: si.customer,
        zahlungsmethode: si.payment_method,
      },
      "Stripe Setup Intent erfolgreich — Zahlungsmethode gespeichert"
    );
  },

  // ── setup_intent.setup_failed ──────────────────────────────────────────
  "setup_intent.setup_failed": async (event, ip) => {
    const si = event.data.object as Stripe.SetupIntent;
    const fehler = si.last_setup_error?.message ?? "Setup fehlgeschlagen";

    logger.error(
      { setupIntentId: si.id, fehler },
      "🚨 Stripe Setup Intent FEHLGESCHLAGEN"
    );
  },

  // ── charge.refunded ─────────────────────────────────────────────────────
  "charge.refunded": async (event, ip) => {
    const charge = event.data.object as Stripe.Charge;
    const betrag = (charge.amount_refunded ?? 0) / 100;

    if (betrag > 0) {
      await schreibeTransaktion({
        transaktionsId: `refund_${charge.id}`,
        stripeEventId: event.id,
        quelle: "Stripe",
        typ: "rueckerstattung",
        betrag: -betrag,
        waehrung: (charge.currency ?? "eur").toUpperCase(),
        beschreibung: `Stripe Rückerstattung: ${charge.id}`,
        metadaten: {
          chargeId: charge.id,
          customerId: charge.customer,
          grund: charge.refunds?.data[0]?.reason,
        },
      });

      logger.warn(
        { chargeId: charge.id, betrag },
        "Stripe Rückerstattung in DB geschrieben"
      );
    }
  },

  // ── charge.dispute.created ──────────────────────────────────────────────
  "charge.dispute.created": async (event, ip) => {
    const dispute = event.data.object as Stripe.Dispute;
    logger.error(
      {
        disputeId: dispute.id,
        betrag: dispute.amount / 100,
        grund: dispute.reason,
        chargeId: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id,
      },
      "🚨 Stripe DISPUTE erstellt — Sofortiges Handeln erforderlich!"
    );
  },

  // ── radar.early_fraud_warning.created ──────────────────────────────────
  "radar.early_fraud_warning.created": async (event, ip) => {
    const efw = event.data.object as Stripe.Radar.EarlyFraudWarning;
    logger.error(
      {
        earlyFraudWarningId: efw.id,
        chargeId: efw.charge,
        betrag: efw.amount,
      },
      "🚨 Stripe FRÜH-FAUD-WARNUNG — Zahlung überprüfen!"
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSHOT HANDLER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class WebhookHandlers {

  /**
   * Haupt-Verarbeitung: Wird asynchron nach 200-Response aufgerufen.
   * Verarbeitet das Event über den modularen Event-Router.
   */
  static async processEventAsync(
    event: Stripe.Event,
    ipAdresse?: string
  ): Promise<void> {
    // ── 1. Event-Deduplizierung ──────────────────────────────────────────
    if (istBereitsVerarbeitet(event.id)) {
      logger.info(
        { eventId: event.id, eventType: event.type },
        "⏭️ Stripe Event bereits verarbeitet — übersprungen"
      );
      return;
    }

    // ── 2. Event-Typ路由 ───────────────────────────────────────────────
    const handler = eventHandlers[event.type];

    if (handler) {
      try {
        await handler(event, ipAdresse);

        // Erfolgreiche Verarbeitung audit-loggen
        await protokolliereWebhookEvent({
          quelle: "stripe",
          ereignisTyp: event.type,
          externId: event.id,
          payload: { verarbeitungsZeitpunkt: new Date().toISOString() },
          signaturPruefung: true,
          signaturGueltig: true,
          verarbeitet: true,
          ipAdresse: ipAdresse,
        });

      } catch (err) {
        const fehlerMsg = err instanceof Error ? err.message : "Verarbeitungsfehler";

        logger.error(
          { eventType: event.type, eventId: event.id, err },
          `❌ Stripe Event ${event.type} fehlgeschlagen`
        );

        // Fehler audit-loggen (aber Event als "verarbeitet" markieren,
        // damit Stripe nicht endlos retryed)
        await protokolliereWebhookEvent({
          quelle: "stripe",
          ereignisTyp: event.type,
          externId: event.id,
          payload: { fehlerVerarbeitung: true },
          signaturPruefung: true,
          signaturGueltig: true,
          verarbeitet: false,
          fehler: fehlerMsg,
          ipAdresse: ipAdresse,
        });
      }
    } else {
      // ── Unbekanntes Event — nur loggen, nicht als Fehler behandeln ────
      logger.info(
        { eventType: event.type, eventId: event.id },
        "ℹ️ Stripe unbekanntes Event-Type — protokolliert, keine Aktion"
      );

      await protokolliereWebhookEvent({
        quelle: "stripe",
        ereignisTyp: event.type,
        externId: event.id,
        payload: { unbekannt: true },
        signaturPruefung: true,
        signaturGueltig: true,
        verarbeitet: true,
        ipAdresse: ipAdresse,
      });
    }
  }

  /**
   * Loggt ungültige Webhook-Signaturen (wird aus app.ts aufgerufen).
   */
  static async logInvalidSignature(
    signatur: string,
    fehler: string,
    ipAdresse?: string
  ): Promise<void> {
    await protokolliereWebhookEvent({
      quelle: "stripe",
      ereignisTyp: "SIGNATUR_FEHLGESCHLAGEN",
      payload: { signaturePreview: signatur },
      signaturPruefung: true,
      signaturGueltig: false,
      verarbeitet: false,
      fehler,
      ipAdresse,
    });
  }

  /**
   * Gibt die Liste der unterstützten Event-Typen zurück.
   * Nützlich für Konfiguration und Dokumentation.
   */
  static getUnterstuetzteEvents(): string[] {
    return Object.keys(eventHandlers);
  }
}

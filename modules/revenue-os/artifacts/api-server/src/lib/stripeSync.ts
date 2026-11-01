import type Stripe from "stripe";
import { getStripeClient } from "./stripeClient";
import { db, transactionsTable } from "@workspace/db";
import { logger } from "./logger";

const SYNC_LOOKBACK_MS = 48 * 60 * 60 * 1000; // 48 Stunden

export interface StripeSyncErgebnis {
  geprüft: number;
  neu: number;
}

/**
 * Periodischer Stripe-Abgleich (Polling).
 *
 * Hintergrund: Bei privater Deployment-Sichtbarkeit blockiert der
 * Replit-Schutzschild eingehende Stripe-Webhooks (307-Redirect zur
 * Anmeldung). Ausgehende Verbindungen funktionieren weiterhin, daher
 * holt dieser Abgleich erfolgreiche Zahlungen und bezahlte Rechnungen
 * aktiv von der Stripe-API ab und schreibt sie idempotent in die DB.
 *
 * Dedupe / Single Source of Truth:
 * - `transaktionsId` ist UNIQUE und es werden dieselben IDs wie im
 *   Webhook-Handler verwendet (PaymentIntent-ID bzw. Invoice-ID), sodass
 *   Webhook und Sync sich bei gleicher ID nie doppeln (`onConflictDoNothing`).
 * - Fachliche Doppelzählung wird vermieden: Zuerst werden die bezahlten
 *   Rechnungen verarbeitet und deren PaymentIntent-IDs gesammelt.
 *   Diese PaymentIntents werden im zweiten Durchlauf übersprungen —
 *   Abo-/Rechnungszahlungen zählen nur einmal (über die Invoice),
 *   Einmalzahlungen nur über den PaymentIntent.
 */
export async function syncStripeTransaktionen(): Promise<StripeSyncErgebnis> {
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn("Stripe-Sync übersprungen — STRIPE_SECRET_KEY fehlt");
    return { geprüft: 0, neu: 0 };
  }

  const stripe = getStripeClient();
  const gte = Math.floor((Date.now() - SYNC_LOOKBACK_MS) / 1000);

  let geprüft = 0;
  let neu = 0;

  // ── 1. Bezahlte Rechnungen (Abos etc.) — PaymentIntent-IDs sammeln ──
  const rechnungsPiIds = new Set<string>();

  for await (const invoice of stripe.invoices.list({
    status: "paid",
    created: { gte },
    limit: 100,
    expand: ["data.payments"],
  })) {
    // Zur Rechnung gehörende PaymentIntents merken (werden unten übersprungen)
    for (const zahlung of invoice.payments?.data ?? []) {
      const piRef = zahlung.payment?.payment_intent;
      if (piRef) rechnungsPiIds.add(typeof piRef === "string" ? piRef : piRef.id);
    }

    const betrag = (invoice.amount_paid ?? 0) / 100;
    if (betrag <= 0 || !invoice.id) continue;
    geprüft++;

    const eingefügt = await db
      .insert(transactionsTable)
      .values({
        transaktionsId: invoice.id,
        quelle: "Stripe",
        typ: "einnahme",
        betrag: betrag.toString(),
        waehrung: invoice.currency.toUpperCase(),
        beschreibung: `Stripe Rechnung bezahlt: ${invoice.id}`,
        metadaten: JSON.stringify({
          invoiceId: invoice.id,
          customerId: invoice.customer,
          via: "sync",
        }),
      })
      .onConflictDoNothing()
      .returning({ id: transactionsTable.id });

    if (eingefügt.length > 0) {
      neu++;
      logger.info({ invoiceId: invoice.id, betrag }, "Stripe-Sync: Invoice-Zahlung in DB geschrieben");
    }
  }

  // ── 2. Erfolgreiche Einmalzahlungen (PaymentIntents) ──
  for await (const pi of stripe.paymentIntents.list({ created: { gte }, limit: 100 })) {
    if (pi.status !== "succeeded") continue;
    // Rechnungs-Zahlungen wurden bereits über die Invoice gebucht —
    // hier überspringen, sonst würde dieselbe Zahlung doppelt gezählt.
    if (rechnungsPiIds.has(pi.id)) continue;
    // Fallback für ältere Stripe-API-Versionen, die `invoice` noch am
    // PaymentIntent führen (Feld existiert in neuen Typen nicht mehr).
    const altInvoiceRef = (pi as unknown as { invoice?: string | Stripe.Invoice | null }).invoice;
    if (altInvoiceRef) continue;
    geprüft++;

    const eingefügt = await db
      .insert(transactionsTable)
      .values({
        transaktionsId: pi.id,
        quelle: "Stripe",
        typ: "einnahme",
        betrag: (pi.amount / 100).toString(),
        waehrung: pi.currency.toUpperCase(),
        beschreibung: `Stripe Zahlung: ${pi.id}`,
        metadaten: JSON.stringify({
          paymentIntentId: pi.id,
          customerId: pi.customer,
          via: "sync",
        }),
      })
      .onConflictDoNothing()
      .returning({ id: transactionsTable.id });

    if (eingefügt.length > 0) {
      neu++;
      logger.info(
        { paymentIntentId: pi.id, betrag: pi.amount / 100 },
        "Stripe-Sync: Zahlung in DB geschrieben",
      );
    }
  }

  return { geprüft, neu };
}

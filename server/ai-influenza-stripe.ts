/**
 * Sprint 4 — AI Influenza: Stripe-Anbindung (Checkout, Objekt-Anlage, Webhook).
 *
 * Sicherheitsregeln:
 *  - Modus-Sperre: Live-Key nur mit AI_INFLUENZA_STRIPE_LIVE=true.
 *  - Objekt-Anlage laeuft standardmaessig als Trockenlauf (nichts wird angelegt).
 *  - Eigenes Webhook-Secret (AI_INFLUENZA_STRIPE_WEBHOOK_SECRET), getrennt vom App-Billing.
 *  - Idempotenz ueber aiStripeEreignisse.stripe_event_id und UNIQUE-Constraints.
 *  - Checkout nur zu einem freigegebenen/versendeten Angebot (Freigabe-Gate).
 *  - Keine Secrets in Logs oder Fehlermeldungen.
 */
import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import { aiKundenAuftraege, aiStripeEreignisse, aiZahlungen } from "../drizzle/schema";
import {
  baueCheckoutPlan,
  planeStripeObjekte,
  pruefeStripeModus,
  wertWebhookAus,
  type StripeBetriebsmodus,
  type WebhookAktion,
} from "../lib/ai-influenza-stripe-logic";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function requireDb(): Promise<AppDb> {
  const db: AppDb | null = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar (DATABASE_URL fehlt)");
  return db;
}

export class AiInfluenzaStripeError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 500 = 400) {
    super(message);
    this.name = "AiInfluenzaStripeError";
  }
}

function holeStripe(): { stripe: Stripe; modus: StripeBetriebsmodus } {
  const key = process.env.AI_INFLUENZA_STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim();
  const pruefung = pruefeStripeModus(key, process.env.AI_INFLUENZA_STRIPE_LIVE === "true");
  if (!pruefung.erlaubt || pruefung.modus === "unbekannt") {
    throw new AiInfluenzaStripeError(pruefung.grund ?? "Stripe-Modus nicht erlaubt.", 403);
  }
  return { stripe: new Stripe(key!), modus: pruefung.modus };
}

/** Status der Stripe-Anbindung ohne Netzwerkaufruf und ohne Secrets. */
export function stripeStatus() {
  const key = process.env.AI_INFLUENZA_STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim();
  const pruefung = pruefeStripeModus(key, process.env.AI_INFLUENZA_STRIPE_LIVE === "true");
  return {
    keyVorhanden: Boolean(key),
    modus: pruefung.modus,
    freigegeben: pruefung.erlaubt,
    grund: pruefung.grund ?? null,
    eigenesWebhookSecret: Boolean(process.env.AI_INFLUENZA_STRIPE_WEBHOOK_SECRET?.trim()),
  };
}

/**
 * Legt Produkte und Preise idempotent an (lookup_key). Standard: Trockenlauf.
 * Nur mit trocken=false werden bei Stripe Objekte erzeugt.
 */
export async function richteStripeObjekteEin(opts: { trocken: boolean }) {
  const { stripe, modus } = holeStripe();
  const plan = planeStripeObjekte(modus);
  const ergebnis: Array<{ paket: string; lookupKey: string; aktion: "vorhanden" | "wuerde_anlegen" | "angelegt"; preisId?: string }> = [];

  for (const p of plan) {
    const vorhanden = await stripe.prices.list({ lookup_keys: [p.lookupKey], limit: 1 });
    if (vorhanden.data[0]) {
      ergebnis.push({ paket: p.paketId, lookupKey: p.lookupKey, aktion: "vorhanden", preisId: vorhanden.data[0].id });
      continue;
    }
    if (opts.trocken) {
      ergebnis.push({ paket: p.paketId, lookupKey: p.lookupKey, aktion: "wuerde_anlegen" });
      continue;
    }
    const produkt = await stripe.products.create({ name: p.produktName, metadata: p.metadata });
    const preis = await stripe.prices.create({
      product: produkt.id,
      currency: p.waehrung,
      unit_amount: p.betragCent,
      recurring: { interval: p.intervall },
      lookup_key: p.lookupKey,
      metadata: p.metadata,
    });
    ergebnis.push({ paket: p.paketId, lookupKey: p.lookupKey, aktion: "angelegt", preisId: preis.id });
  }
  return { modus, trocken: opts.trocken, objekte: ergebnis };
}

/** Checkout-Session fuer ein freigegebenes Angebot (Firmenkunde, getrennt vom App-Billing). */
export async function erstelleCheckout(eingabe: {
  paketId: string;
  kundeId: number;
  angebotId: number;
  kundeEmail: string;
  angebotStatus: string;
}) {
  if (!["freigegeben", "versendet"].includes(eingabe.angebotStatus)) {
    throw new AiInfluenzaStripeError("Checkout nur zu einem freigegebenen oder versendeten Angebot.", 403);
  }
  const { stripe, modus } = holeStripe();
  const baseUrl = (process.env.APP_BASE_URL ?? "").trim();
  const plan = baueCheckoutPlan({ ...eingabe, baseUrl }, modus);
  if (!plan.ok) throw new AiInfluenzaStripeError(plan.fehler, 400);

  const preise = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
  const preis = preise.data[0];
  if (!preis) {
    throw new AiInfluenzaStripeError(`Preis ${plan.lookupKey} existiert noch nicht bei Stripe. Zuerst Stripe-Objekte einrichten.`, 400);
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: eingabe.kundeEmail,
    line_items: [{ price: preis.id, quantity: 1 }],
    success_url: plan.successUrl,
    cancel_url: plan.cancelUrl,
    allow_promotion_codes: false,
    metadata: plan.metadata,
    subscription_data: { metadata: plan.metadata },
  });
  if (!session.url) throw new AiInfluenzaStripeError("Stripe hat keine Checkout-URL geliefert.", 500);
  return { url: session.url, sessionId: session.id, modus };
}

/** Verifizierter Webhook: Signatur, Modus, Idempotenz, dann Fachaktion. */
export async function verarbeiteWebhook(payload: Buffer, signature: string | undefined) {
  const secret = process.env.AI_INFLUENZA_STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new AiInfluenzaStripeError("AI_INFLUENZA_STRIPE_WEBHOOK_SECRET ist nicht konfiguriert.", 500);
  if (!signature) throw new AiInfluenzaStripeError("Stripe-Signatur fehlt.", 400);

  const { stripe, modus } = holeStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new AiInfluenzaStripeError("Webhook-Signatur ungültig.", 400);
  }

  const db = await requireDb();
  const aktion = wertWebhookAus(event as any, modus);

  const eingefuegt = await db
    .insert(aiStripeEreignisse)
    .values({ stripeEventId: event.id, eventTyp: event.type, modus, aktion: aktion.art })
    .onConflictDoNothing({ target: aiStripeEreignisse.stripeEventId })
    .returning({ id: aiStripeEreignisse.id });
  if (eingefuegt.length === 0) return { received: true, duplicate: true as const, aktion: aktion.art };

  try {
    await wendeAktionAn(db, aktion, modus);
    await db.update(aiStripeEreignisse).set({ verarbeitet: true }).where(eq(aiStripeEreignisse.stripeEventId, event.id));
  } catch (err) {
    const meldung = err instanceof Error ? err.message.slice(0, 400) : "Unbekannter Fehler";
    await db.update(aiStripeEreignisse).set({ fehler: meldung }).where(eq(aiStripeEreignisse.stripeEventId, event.id));
    // Event-Zeile entfernen, damit Stripe-Wiederholungen erneut verarbeitet werden koennen.
    await db.delete(aiStripeEreignisse).where(eq(aiStripeEreignisse.stripeEventId, event.id));
    throw new AiInfluenzaStripeError("Verarbeitung fehlgeschlagen.", 500);
  }
  return { received: true, duplicate: false as const, aktion: aktion.art };
}

async function wendeAktionAn(db: AppDb, aktion: WebhookAktion, modus: StripeBetriebsmodus) {
  switch (aktion.art) {
    case "auftrag_anlegen": {
      await db
        .insert(aiKundenAuftraege)
        .values({
          kundeId: aktion.kundeId,
          angebotId: aktion.angebotId,
          paket: aktion.paketId,
          stripeCustomerId: aktion.stripeCustomerId,
          stripeSubscriptionId: aktion.stripeSubscriptionId,
          modus,
        })
        .onConflictDoNothing();
      return;
    }
    case "zahlung_erfasst": {
      const auftrag = aktion.stripeSubscriptionId
        ? (await db.select({ id: aiKundenAuftraege.id }).from(aiKundenAuftraege).where(eq(aiKundenAuftraege.stripeSubscriptionId, aktion.stripeSubscriptionId)).limit(1))[0]
        : undefined;
      await db
        .insert(aiZahlungen)
        .values({
          auftragId: auftrag?.id ?? null,
          stripeRechnungId: aktion.rechnungId,
          stripeSubscriptionId: aktion.stripeSubscriptionId,
          betragCent: aktion.betragCent,
          status: "bezahlt",
          modus,
        })
        .onConflictDoNothing({ target: aiZahlungen.stripeRechnungId });
      return;
    }
    case "zahlung_fehlgeschlagen": {
      if (aktion.stripeSubscriptionId) {
        await db.update(aiKundenAuftraege).set({ aboStatus: "zahlung_offen", updatedAt: sql`now()` }).where(eq(aiKundenAuftraege.stripeSubscriptionId, aktion.stripeSubscriptionId));
      }
      return;
    }
    case "abo_beendet": {
      await db
        .update(aiKundenAuftraege)
        .set({ aboStatus: "beendet", updatedAt: sql`now()` })
        .where(and(eq(aiKundenAuftraege.stripeSubscriptionId, aktion.stripeSubscriptionId)));
      return;
    }
    case "ignorieren":
      return;
  }
}

/** Umsatz und Kosten getrennt: nur bestaetigte Zahlungen zaehlen als Umsatz. */
export async function umsatzUebersicht() {
  const db = await requireDb();
  const rows = await db
    .select({
      modus: aiZahlungen.modus,
      umsatzCent: sql<number>`coalesce(sum(${aiZahlungen.betragCent}) filter (where ${aiZahlungen.status} = 'bezahlt'), 0)::int`,
      zahlungen: sql<number>`count(*) filter (where ${aiZahlungen.status} = 'bezahlt')::int`,
    })
    .from(aiZahlungen)
    .groupBy(aiZahlungen.modus);
  const kosten = await db
    .select({ kostenCent: sql<number>`coalesce(sum(${aiKundenAuftraege.kostenCent}), 0)::int` })
    .from(aiKundenAuftraege);
  return { proModus: rows, kostenCent: kosten[0]?.kostenCent ?? 0 };
}

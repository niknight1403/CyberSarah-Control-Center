/**
 * Sprint 4 — AI Influenza: Stripe-Logik (rein, ohne Netzwerk, testbar).
 *
 * Leitplanken aus dem Master-Prompt:
 *  - Keine simulierten Live-Zahlungen, Abnahme mit Stripe-Testzahlungen.
 *  - Zahlungsstatus nur ueber verifizierte Webhooks.
 *  - Keine Secrets im Code, Repo oder Logs.
 *
 * Diese Strecke ist vom App-Billing (Lite/Pro/Expert, gekoppelt an `users`)
 * getrennt: AI-Influenza-Kunden sind Firmenkunden in `kunden`.
 */
import { findPaket, type PaketId } from "./ai-influenza-logic";

export type StripeBetriebsmodus = "test" | "live";

export interface ModusPruefung {
  erlaubt: boolean;
  modus: StripeBetriebsmodus | "unbekannt";
  grund?: string;
}

/** Erkennt den Modus ausschliesslich am Schluessel-Praefix (nie am Inhalt). */
export function erkenneModus(secretKey: string | undefined | null): StripeBetriebsmodus | "unbekannt" {
  const k = (secretKey ?? "").trim();
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return "test";
  if (k.startsWith("sk_live_") || k.startsWith("rk_live_")) return "live";
  return "unbekannt";
}

/**
 * Modus-Sperre: Test-Keys sind immer erlaubt. Live-Keys nur mit ausdruecklicher
 * Freigabe (AI_INFLUENZA_STRIPE_LIVE=true). Unbekannte Keys werden abgelehnt.
 */
export function pruefeStripeModus(secretKey: string | undefined | null, liveFreigabe: boolean): ModusPruefung {
  const modus = erkenneModus(secretKey);
  if (modus === "unbekannt") {
    return { erlaubt: false, modus, grund: "Stripe-Schluessel fehlt oder hat ein unbekanntes Format." };
  }
  if (modus === "live" && !liveFreigabe) {
    return {
      erlaubt: false,
      modus,
      grund: "Live-Schluessel erkannt, aber AI_INFLUENZA_STRIPE_LIVE ist nicht freigegeben. Es wird nichts bei Stripe angelegt.",
    };
  }
  return { erlaubt: true, modus };
}

export interface GeplantesStripeObjekt {
  paketId: PaketId;
  produktName: string;
  betragCent: number;
  waehrung: "eur";
  intervall: "month";
  lookupKey: string;
  metadata: Record<string, string>;
}

/** Plan der anzulegenden Produkte/Preise (idempotent ueber lookup_key). */
export function planeStripeObjekte(modus: StripeBetriebsmodus): GeplantesStripeObjekt[] {
  const pakete: PaketId[] = ["starter", "growth", "business"];
  return pakete.map((id) => {
    const p = findPaket(id)!;
    return {
      paketId: id,
      produktName: p.name,
      betragCent: Math.round(p.preisEur * 100),
      waehrung: "eur" as const,
      intervall: p.intervall,
      lookupKey: `ai_influenza_${id}_monthly_${modus}`,
      metadata: { source: "cybersarah-ai-influenza", paket: id, modus },
    };
  });
}

export interface CheckoutEingabe {
  paketId: string;
  kundeId: number;
  angebotId: number;
  kundeEmail: string;
  baseUrl: string;
}

export type CheckoutPlan =
  | { ok: true; paketId: PaketId; lookupKey: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string }
  | { ok: false; fehler: string };

/** Validiert Eingaben und baut den Checkout-Plan (ohne Stripe-Aufruf). */
export function baueCheckoutPlan(eingabe: CheckoutEingabe, modus: StripeBetriebsmodus): CheckoutPlan {
  const paket = findPaket(eingabe.paketId);
  if (!paket) return { ok: false, fehler: `Unbekanntes Paket: ${eingabe.paketId}` };
  if (!Number.isSafeInteger(eingabe.kundeId) || eingabe.kundeId <= 0) return { ok: false, fehler: "Ungueltige Kunden-ID." };
  if (!Number.isSafeInteger(eingabe.angebotId) || eingabe.angebotId <= 0) {
    return { ok: false, fehler: "Checkout nur zu einem freigegebenen Angebot (Angebots-ID fehlt)." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(eingabe.kundeEmail)) return { ok: false, fehler: "Ungueltige Kunden-E-Mail." };
  const basis = eingabe.baseUrl.replace(/\/+$/, "");
  if (!basis.startsWith("https://")) return { ok: false, fehler: "Basis-URL muss mit https:// beginnen." };
  return {
    ok: true,
    paketId: paket.id,
    lookupKey: `ai_influenza_${paket.id}_monthly_${modus}`,
    metadata: {
      source: "cybersarah-ai-influenza",
      paket: paket.id,
      kundeId: String(eingabe.kundeId),
      angebotId: String(eingabe.angebotId),
      modus,
    },
    successUrl: `${basis}/ai-influenza/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${basis}/ai-influenza/checkout?status=cancelled`,
  };
}

// ---------------------------------------------------------------------------
// Webhook-Auswertung: nur Events mit unserem Metadaten-Vertrag zaehlen.
// ---------------------------------------------------------------------------
export type WebhookAktion =
  | { art: "ignorieren"; grund: string }
  | { art: "auftrag_anlegen"; kundeId: number; angebotId: number; paketId: PaketId; stripeSubscriptionId: string | null; stripeCustomerId: string | null; betragCent: number | null }
  | { art: "zahlung_erfasst"; stripeSubscriptionId: string | null; stripeCustomerId: string | null; betragCent: number; rechnungId: string | null }
  | { art: "zahlung_fehlgeschlagen"; stripeSubscriptionId: string | null; rechnungId: string | null }
  | { art: "abo_beendet"; stripeSubscriptionId: string };

type StripeEventLike = {
  id?: string;
  type: string;
  livemode?: boolean;
  data: { object: Record<string, any> };
};

const idVon = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as any).id === "string" ? (v as any).id : null;

/** Ordnet ein verifiziertes Stripe-Event einer fachlichen Aktion zu. */
export function wertWebhookAus(event: StripeEventLike, erwarteterModus: StripeBetriebsmodus): WebhookAktion {
  const istLive = event.livemode === true;
  if ((erwarteterModus === "live") !== istLive) {
    return { art: "ignorieren", grund: `Event-Modus (${istLive ? "live" : "test"}) passt nicht zum erwarteten Modus (${erwarteterModus}).` };
  }
  const obj = event.data?.object ?? {};
  const meta = (obj.metadata ?? obj.subscription_details?.metadata ?? {}) as Record<string, string>;

  switch (event.type) {
    case "checkout.session.completed": {
      if (meta.source !== "cybersarah-ai-influenza") return { art: "ignorieren", grund: "Fremdes Event (App-Billing o. a.)." };
      if (obj.payment_status && obj.payment_status !== "paid" && obj.payment_status !== "no_payment_required") {
        return { art: "ignorieren", grund: `Zahlung noch nicht bestaetigt (${obj.payment_status}).` };
      }
      const paket = findPaket(meta.paket ?? "");
      const kundeId = Number(meta.kundeId);
      const angebotId = Number(meta.angebotId);
      if (!paket || !Number.isSafeInteger(kundeId) || kundeId <= 0 || !Number.isSafeInteger(angebotId) || angebotId <= 0) {
        return { art: "ignorieren", grund: "Metadaten unvollstaendig." };
      }
      return {
        art: "auftrag_anlegen",
        kundeId,
        angebotId,
        paketId: paket.id,
        stripeSubscriptionId: idVon(obj.subscription),
        stripeCustomerId: idVon(obj.customer),
        betragCent: typeof obj.amount_total === "number" ? obj.amount_total : null,
      };
    }
    case "invoice.paid": {
      const sub = idVon(obj.subscription ?? obj.parent?.subscription_details?.subscription);
      const subMeta = (obj.subscription_details?.metadata ?? obj.parent?.subscription_details?.metadata ?? {}) as Record<string, string>;
      if (subMeta.source !== "cybersarah-ai-influenza") return { art: "ignorieren", grund: "Fremde Rechnung." };
      const betrag = typeof obj.amount_paid === "number" ? obj.amount_paid : 0;
      if (betrag <= 0) return { art: "ignorieren", grund: "Rechnung ohne Zahlbetrag." };
      return { art: "zahlung_erfasst", stripeSubscriptionId: sub, stripeCustomerId: idVon(obj.customer), betragCent: betrag, rechnungId: typeof obj.id === "string" ? obj.id : null };
    }
    case "invoice.payment_failed": {
      const subMeta = (obj.subscription_details?.metadata ?? obj.parent?.subscription_details?.metadata ?? {}) as Record<string, string>;
      if (subMeta.source !== "cybersarah-ai-influenza") return { art: "ignorieren", grund: "Fremde Rechnung." };
      return { art: "zahlung_fehlgeschlagen", stripeSubscriptionId: idVon(obj.subscription ?? obj.parent?.subscription_details?.subscription), rechnungId: typeof obj.id === "string" ? obj.id : null };
    }
    case "customer.subscription.deleted": {
      if (meta.source !== "cybersarah-ai-influenza") return { art: "ignorieren", grund: "Fremdes Abo." };
      const id = typeof obj.id === "string" ? obj.id : null;
      return id ? { art: "abo_beendet", stripeSubscriptionId: id } : { art: "ignorieren", grund: "Abo-ID fehlt." };
    }
    default:
      return { art: "ignorieren", grund: `Event ${event.type} wird nicht ausgewertet.` };
  }
}

/** Umsatz nur aus bestaetigten Zahlungen: Cent -> ehrliche Summe. */
export function summiereBestaetigtenUmsatzCent(zahlungen: Array<{ betragCent: number; status: string }>): number {
  return zahlungen.filter((z) => z.status === "bezahlt" && z.betragCent > 0).reduce((s, z) => s + z.betragCent, 0);
}

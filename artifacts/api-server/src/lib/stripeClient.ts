import Stripe from "stripe";
import { logger } from "./logger";

const secretKey = process.env.STRIPE_SECRET_KEY;

// Live vs Test-Modus Detection
export const stripeTestModus = !secretKey || secretKey.startsWith("sk_test_");
export const stripeLiveKey = secretKey?.startsWith("sk_live_") ?? false;

if (!secretKey) {
  logger.warn("⚠️ STRIPE_SECRET_KEY fehlt — Stripe deaktiviert");
} else if (stripeTestModus) {
  logger.error(
    { keyPrefix: secretKey.substring(0, 12) + "..." },
    "🧪 STRIPE TEST-MODUS AKTIV! Transaktionen erscheinen NICHT auf dem Bankkonto. " +
    "Bitte STRIPE_SECRET_KEY mit 'sk_live_' Prefix setzen!"
  );
} else {
  logger.info("✅ Stripe LIVE-MODUS aktiv — Echte Transaktionen werden verarbeitet");
}

function getCredentials(): { secretKey: string; webhookSecret: string } {
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY Umgebungsvariable fehlt.");
  }
  return { secretKey, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "" };
}

let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_client) {
    const { secretKey: key } = getCredentials();
    _client = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
    logger.info({ modus: stripeTestModus ? "TEST" : "LIVE" }, "Stripe-Client initialisiert");
  }
  return _client;
}

export function getWebhookSecret(): string {
  return getCredentials().webhookSecret;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey: key } = getCredentials();
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

// ─── Live-Modus Validierung ───────────────────────────────────────────────────

export async function pruefeStripeVerbindung(): Promise<{
  verbunden: boolean;
  modus: "live" | "test" | "nicht_konfiguriert";
  saldo?: number;
  fehler?: string;
}> {
  if (!secretKey) {
    return { verbunden: false, modus: "nicht_konfiguriert", fehler: "STRIPE_SECRET_KEY fehlt" };
  }

  try {
    const stripe = getStripeClient();
    const balance = await stripe.balance.retrieve();
    const hauptkonto = balance.available?.[0];
    return {
      verbunden: true,
      modus: stripeLiveKey ? "live" : "test",
      saldo: hauptkonto ? hauptkonto.amount / 100 : 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error({ err }, "Stripe Verbindungsprüfung fehlgeschlagen");
    return {
      verbunden: false,
      modus: stripeLiveKey ? "live" : "test",
      fehler: msg,
    };
  }
}

// ─── Payment Intent erstellen ─────────────────────────────────────────────────

export async function erstellePaymentIntent(params: {
  betrag: number;
  waehrung?: string;
  beschreibung?: string;
  metadaten?: Record<string, string>;
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripeClient();
  const betragInCenten = Math.round(params.betrag * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: betragInCenten,
    currency: params.waehrung ?? "eur",
    description: params.beschreibung,
    metadata: params.metadaten ?? {},
    automatic_payment_methods: { enabled: true },
  });

  logger.info(
    { paymentIntentId: paymentIntent.id, betrag: params.betrag },
    "Stripe PaymentIntent erstellt"
  );

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

// ─── Checkout Session erstellen ───────────────────────────────────────────────

export async function erstelleCheckoutSession(params: {
  betrag: number;
  produktName: string;
  succesUrl?: string;
  cancelUrl?: string;
}): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: { name: params.produktName },
        unit_amount: Math.round(params.betrag * 100),
      },
      quantity: 1,
    }],
    success_url: params.succesUrl ?? `${process.env["APP_URL"] ?? "https://cybersarah.ai"}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl ?? `${process.env["APP_URL"] ?? "https://cybersarah.ai"}/cancel`,
  });

  logger.info(
    { sessionId: session.id, betrag: params.betrag, produkt: params.produktName },
    "Stripe Checkout-Session erstellt"
  );

  return { sessionId: session.id, url: session.url! };
}

// ─── Webhook-Signatur prüfen ─────────────────────────────────────────────────

export function pruefeWebhookSignatur(payload: Buffer, signature: string): Stripe.Event {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET nicht konfiguriert");
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

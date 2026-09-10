import Stripe from "stripe";
import * as db from "./db";

const LIVE_KEY_PREFIX = "sk_live_";
const TEST_KEY_PREFIX = "sk_test_";
export type StripeMode = "live" | "test";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(
      `${name} ist für die produktive Abrechnung nicht konfiguriert.`,
    );
  return value;
}

export function getStripeMode(): StripeMode {
  const mode = (process.env.STRIPE_MODE ?? "live").trim().toLowerCase();
  if (mode !== "live" && mode !== "test")
    throw new Error("STRIPE_MODE muss entweder 'live' oder 'test' sein.");
  return mode;
}

export function validateStripeSecretKey(key: string, mode: StripeMode) {
  const expectedPrefix = mode === "live" ? LIVE_KEY_PREFIX : TEST_KEY_PREFIX;
  if (!key.startsWith(expectedPrefix))
    throw new Error(
      `Der Stripe-Secret-Key passt nicht zu STRIPE_MODE=${mode}. Erwartet wird ${expectedPrefix}…`,
    );
  return key;
}

function getStripe() {
  const key = requiredEnvironment("STRIPE_SECRET_KEY");
  validateStripeSecretKey(key, getStripeMode());
  return new Stripe(key);
}

function getAppBaseUrl() {
  const baseUrl = requiredEnvironment("APP_BASE_URL").replace(/\/$/, "");
  if (!baseUrl.startsWith("https://"))
    throw new Error(
      "APP_BASE_URL muss für produktive Zahlungen eine HTTPS-URL sein.",
    );
  return baseUrl;
}

export type SubscriptionPriceLike = {
  id: string;
  active: boolean;
  type: string;
  recurring: { interval: string } | null;
};

export type StripePriceApi = {
  prices: {
    retrieve(id: string): Promise<unknown>;
    list(params: {
      product?: string;
      lookup_keys?: string[];
      active?: boolean;
      limit?: number;
    }): Promise<unknown>;
  };
};

export function normalizeSubscriptionPrice(raw: unknown): SubscriptionPriceLike | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as {
    id?: unknown;
    active?: unknown;
    type?: unknown;
    recurring?: unknown;
  };
  if (typeof candidate.id !== "string" || typeof candidate.active !== "boolean") return null;
  if (candidate.type !== "recurring" && candidate.type !== "one_time") return null;
  let recurring: { interval: string } | null = null;
  if (typeof candidate.recurring === "object" && candidate.recurring !== null) {
    const interval = (candidate.recurring as { interval?: unknown }).interval;
    if (typeof interval === "string") recurring = { interval };
  }
  return { id: candidate.id, active: candidate.active, type: candidate.type, recurring };
}

let resolvedPriceIdCache: string | null = null;

export function resetResolvedPriceIdCache() {
  resolvedPriceIdCache = null;
}

export function pickSubscriptionPriceId(
  prices: SubscriptionPriceLike[],
): SubscriptionPriceLike | null {
  const recurring = prices.filter((price) => price.active && price.type === "recurring");
  const monthly = recurring.find((price) => price.recurring?.interval === "month");
  return monthly ?? recurring[0] ?? null;
}

/**
 * Löst die Abo-Preis-ID autonom auf:
 * 1. Konfigurierter STRIPE_PRICE_ID, sofern Stripe ihn als aktiv und
 *    wiederkehrend bestätigt (fängt Platzhalter/Tippfehler ab).
 * 2. Sonst aktiver wiederkehrender Preis über STRIPE_PRICE_LOOKUP_KEY.
 * 3. Sonst aktiver wiederkehrender Preis des Produkts aus
 *    STRIPE_PRODUCT_MONATLICH (Monatspreis bevorzugt).
 * Erfolgreiche Auflösungen werden prozessweit gecacht.
 */
export async function resolveSubscriptionPriceId(stripe: StripePriceApi) {
  if (resolvedPriceIdCache) return resolvedPriceIdCache;

  const configured = process.env.STRIPE_PRICE_ID?.trim() ?? "";
  if (configured.startsWith("price_")) {
    try {
      const price = normalizeSubscriptionPrice(await stripe.prices.retrieve(configured));
      if (price && price.active && price.type === "recurring") {
        resolvedPriceIdCache = configured;
        return configured;
      }
      console.warn(
        `[Billing] STRIPE_PRICE_ID (${configured}) ist inaktiv oder nicht wiederkehrend – falle auf die Produkt-Auflösung zurück.`,
      );
    } catch (error) {
      console.warn(
        `[Billing] STRIPE_PRICE_ID (${configured}) wurde von Stripe abgelehnt (${
          error instanceof Error ? error.message : "unbekannter Fehler"
        }) – falle auf die Produkt-Auflösung zurück.`,
      );
    }
  }

  const lookupKey = process.env.STRIPE_PRICE_LOOKUP_KEY?.trim() ?? "";
  if (lookupKey) {
    const listed = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 100,
    });
    const data =
      (listed as { data?: unknown }).data instanceof Array
        ? (listed as { data: unknown[] }).data
        : [];
    const picked = pickSubscriptionPriceId(
      data
        .map(normalizeSubscriptionPrice)
        .filter((p): p is SubscriptionPriceLike => p !== null),
    );
    if (picked) {
      resolvedPriceIdCache = picked.id;
      console.info(
        `[Billing] Abo-Preis automatisch über STRIPE_PRICE_LOOKUP_KEY aufgelöst: ${picked.id}`,
      );
      return picked.id;
    }
  }

  const productId = process.env.STRIPE_PRODUCT_MONATLICH?.trim() ?? "";
  if (productId) {
    const listed = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
    });
    const data =
      (listed as { data?: unknown }).data instanceof Array ? (listed as { data: unknown[] }).data : [];
    const picked = pickSubscriptionPriceId(
      data.map(normalizeSubscriptionPrice).filter((p): p is SubscriptionPriceLike => p !== null),
    );
    if (picked) {
      resolvedPriceIdCache = picked.id;
      console.info(
        `[Billing] Abo-Preis automatisch über STRIPE_PRODUCT_MONATLICH aufgelöst: ${picked.id}`,
      );
      return picked.id;
    }
  }

  throw new Error(
    "STRIPE_PRICE_ID fehlt oder ist ungültig und konnte nicht über STRIPE_PRICE_LOOKUP_KEY oder STRIPE_PRODUCT_MONATLICH aufgelöst werden. Bitte im Stripe-Dashboard einen aktiven wiederkehrenden Preis prüfen.",
  );
}

export function assertLiveStripeConfiguration() {
  requiredEnvironment("STRIPE_WEBHOOK_SECRET");
  getAppBaseUrl();
  const configuredPrice = process.env.STRIPE_PRICE_ID?.trim() ?? "";
  if (configuredPrice && !configuredPrice.startsWith("price_"))
    throw new Error("STRIPE_PRICE_ID muss eine gültige Stripe-Preis-ID sein.");
  return getStripe();
}

export async function createLiveCheckoutSession(user: {
  id: number;
  email: string | null;
  name: string | null;
  stripeCustomerId: string | null;
}) {
  const stripe = assertLiveStripeConfiguration();
  const customerId =
    user.stripeCustomerId ||
    (
      await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: { cyberSarahUserId: String(user.id) },
      })
    ).id;
  if (!user.stripeCustomerId) await db.setStripeCustomerId(user.id, customerId);

  const baseUrl = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(user.id),
    line_items: [{ price: await resolveSubscriptionPriceId(stripe), quantity: 1 }],
    success_url: `${baseUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/account?checkout=cancelled`,
    allow_promotion_codes: false,
    subscription_data: {
      metadata: {
        cyberSarahUserId: String(user.id),
        source: "cybersarah-control-center",
      },
    },
    metadata: {
      cyberSarahUserId: String(user.id),
      source: "cybersarah-control-center",
    },
  });
  if (!session.url)
    throw new Error("Stripe hat keine Checkout-URL zurückgegeben.");
  return { url: session.url, sessionId: session.id };
}

export async function createLiveBillingPortalSession(user: {
  stripeCustomerId: string | null;
}) {
  if (!user.stripeCustomerId)
    throw new Error(
      "Für dieses Konto existiert noch keine Stripe-Kundenbeziehung.",
    );
  const stripe = assertLiveStripeConfiguration();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${getAppBaseUrl()}/account`,
  });
  return { url: portal.url };
}

async function resolveUserForSubscription(subscription: Stripe.Subscription) {
  const metadataUserId = Number(subscription.metadata.cyberSarahUserId);
  if (Number.isSafeInteger(metadataUserId) && metadataUserId > 0)
    return { id: metadataUserId };
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  return db.getUserByStripeCustomerId(customerId);
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
) {
  const user = await resolveUserForSubscription(subscription);
  if (!user)
    throw new Error(
      "Stripe-Abonnement kann keinem CyberSarah-Konto zugeordnet werden.",
    );
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const priceId = subscriptionPriceId(subscription) ?? subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  await db.setStripeCustomerId(user.id, customerId);
  await db.upsertBillingSubscription({
    userId: user.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: normalizeSubscriptionStatus(subscription.status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  });
}

async function syncInvoiceSubscription(
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const subscriptionReference =
    invoice.parent?.subscription_details?.subscription;
  if (!subscriptionReference) return;
  const subscription =
    typeof subscriptionReference === "string"
      ? await stripe.subscriptions.retrieve(subscriptionReference)
      : subscriptionReference;
  await syncStripeSubscription(subscription);
}

export function isStripeSubscriptionEvent(eventType: string) {
  return new Set([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ]).has(eventType);
}

export async function processStripeWebhook(
  payload: Buffer,
  signature: string | undefined,
) {
  const stripe = assertLiveStripeConfiguration();
  if (!signature) throw new Error("Stripe-Signatur fehlt.");
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    requiredEnvironment("STRIPE_WEBHOOK_SECRET"),
  );
  if (isStripeSubscriptionEvent(event.type)) {
    await syncStripeSubscription(event.data.object as Stripe.Subscription);
  }
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    await syncInvoiceSubscription(stripe, event.data.object as Stripe.Invoice);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = Number(
      session.client_reference_id ?? session.metadata?.cyberSarahUserId,
    );
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (Number.isSafeInteger(userId) && userId > 0 && customerId)
      await db.setStripeCustomerId(userId, customerId);
  }
  return { received: true, eventType: event.type };
}

// ---------------------------------------------------------------------------
// Sprint 70 — Abonnement-Stufen (Lite, Pro, Expert), Webhooks, Verwaltung
// ---------------------------------------------------------------------------

import {
  evaluateTierChange,
  isSubscriptionTier,
  tierFromPriceId,
  tierPriceId,
  entitlementsForTier,
  entitlementsForRole,
  type SubscriptionTier,
} from "../lib/subscription-tiers-logic";
import { normalizeSubscriptionStatus, subscriptionPriceId } from "../lib/stripe-webhook-logic";

export type BillingUser = {
  id: number;
  email: string | null;
  name: string | null;
  stripeCustomerId: string | null;
  role?: string | null;
};

/** Preis-ID einer Stufe: konfiguriert, sonst Fallback-Aufloesung. */
export async function resolveTierPriceId(stripe: StripePriceApi, tier: SubscriptionTier): Promise<string> {
  const configured = tierPriceId(tier, process.env as Record<string, string | undefined>);
  if (configured) return configured;
  // Fallback nur fuer den Legacy-Ein-Tarif-Modus (STRIPE_PRICE_ID).
  if (tier === "lite") return resolveSubscriptionPriceId(stripe);
  throw new Error(
    `Für die Stufe "${tier}" ist keine Preis-ID konfiguriert (STRIPE_PRICE_ID_${tier.toUpperCase()} fehlt).`,
  );
}

/** Checkout fuer eine konkrete Stufe (Lite/Pro/Expert). */
export async function createTierCheckoutSession(user: BillingUser, tier: SubscriptionTier) {
  const stripe = assertLiveStripeConfiguration();
  const customerId =
    user.stripeCustomerId ||
    (
      await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: { cyberSarahUserId: String(user.id) },
      })
    ).id;
  if (!user.stripeCustomerId) await db.setStripeCustomerId(user.id, customerId);

  const baseUrl = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(user.id),
    line_items: [{ price: await resolveTierPriceId(stripe, tier), quantity: 1 }],
    success_url: `${baseUrl}/account?checkout=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/account?checkout=cancelled&tier=${tier}`,
    allow_promotion_codes: false,
    subscription_data: {
      metadata: {
        cyberSarahUserId: String(user.id),
        source: "cybersarah-control-center",
        tier,
      },
    },
    metadata: {
      cyberSarahUserId: String(user.id),
      source: "cybersarah-control-center",
      tier,
    },
  });
  if (!session.url) throw new Error("Stripe hat keine Checkout-URL zurückgegeben.");
  return { url: session.url, sessionId: session.id, tier };
}

/** Kündigung zum Periodenende (benutzerfreundlich, jederzeit widerrufbar). */
export async function cancelUserSubscription(user: BillingUser) {
  const stripe = assertLiveStripeConfiguration();
  const subscription = await db.getBillingSubscriptionForUser(user.id);
  if (!subscription || !subscription.stripeSubscriptionId) {
    throw new Error("Für dieses Konto existiert kein aktives Abonnement.");
  }
  if (subscription.status === "canceled") {
    return { canceled: true, alreadyCanceled: true, cancelAtPeriodEnd: true };
  }
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await db.upsertBillingSubscription({
    userId: subscription.userId,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripePriceId: subscription.stripePriceId ?? null,
    status: subscription.status,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
  });
  return { canceled: true, alreadyCanceled: false, cancelAtPeriodEnd: true };
}

/** Rechnungshistorie aus Stripe (letzte 24 Rechnungen). */
export async function listUserInvoices(user: BillingUser) {
  const stripe = assertLiveStripeConfiguration();
  if (!user.stripeCustomerId) return { invoices: [] };
  const result = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit: 24,
  });
  return {
    invoices: result.data
      .filter((invoice) => invoice.status === "paid" || invoice.status === "open" || invoice.status === "void")
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number ?? null,
        status: invoice.status,
        amountTotal: (invoice as { amount_total?: number }).amount_total ?? 0,
        currency: invoice.currency ?? "eur",
        created: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
      })),
  };
}

/** Abrechnungsstatus inkl. Stufe und Entitlements (Server-Enforcement-Datenbasis). */
export async function getBillingOverview(user: BillingUser) {
  const subscription = await db.getBillingSubscriptionForUser(user.id);
  const env = process.env as Record<string, string | undefined>;
  const tier = subscription?.stripePriceId
    ? tierFromPriceId(subscription.stripePriceId, env)
    : "lite";
  return {
    subscription: subscription ?? null,
    customerConfigured: Boolean(user.stripeCustomerId),
    tier,
    tierLabel: tier === "expert" ? "Expert" : tier === "pro" ? "Pro" : "Lite",
    entitlements: entitlementsForRole(user.role, tier),
    tierEntitlements: entitlementsForTier(tier),
  };
}

/** Upgrade/Downgrade-Entscheidung fuer den Router. */
export function evaluateRequestedTierChange(currentTier: SubscriptionTier, requested: string) {
  if (!isSubscriptionTier(requested)) {
    throw new Error("Unbekannte Tarifstufe — erlaubt sind lite, pro und expert.");
  }
  const decision = evaluateTierChange(currentTier, requested);
  return { requested, ...decision };
}

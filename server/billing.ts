import Stripe from "stripe";
import * as db from "./db";

const LIVE_KEY_PREFIX = "sk_live_";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ist für die produktive Abrechnung nicht konfiguriert.`);
  return value;
}

function getLiveStripe() {
  const key = requiredEnvironment("STRIPE_SECRET_KEY");
  if (!key.startsWith(LIVE_KEY_PREFIX)) {
    throw new Error("Die Abrechnung akzeptiert ausschließlich einen Stripe-Live-Secret-Key (sk_live_…).");
  }
  return new Stripe(key);
}

function getAppBaseUrl() {
  const baseUrl = requiredEnvironment("APP_BASE_URL").replace(/\/$/, "");
  if (!baseUrl.startsWith("https://")) throw new Error("APP_BASE_URL muss für produktive Zahlungen eine HTTPS-URL sein.");
  return baseUrl;
}

function getSubscriptionPriceId() {
  const priceId = requiredEnvironment("STRIPE_PRICE_ID");
  if (!priceId.startsWith("price_")) throw new Error("STRIPE_PRICE_ID muss eine gültige Stripe-Preis-ID sein.");
  return priceId;
}

export function assertLiveStripeConfiguration() {
  requiredEnvironment("STRIPE_WEBHOOK_SECRET");
  getAppBaseUrl();
  getSubscriptionPriceId();
  return getLiveStripe();
}

export async function createLiveCheckoutSession(user: { id: number; email: string | null; name: string | null; stripeCustomerId: string | null }) {
  const stripe = assertLiveStripeConfiguration();
  const customerId = user.stripeCustomerId || (await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { cyberSarahUserId: String(user.id) },
  })).id;
  if (!user.stripeCustomerId) await db.setStripeCustomerId(user.id, customerId);

  const baseUrl = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(user.id),
    line_items: [{ price: getSubscriptionPriceId(), quantity: 1 }],
    success_url: `${baseUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/account?checkout=cancelled`,
    allow_promotion_codes: false,
    subscription_data: { metadata: { cyberSarahUserId: String(user.id), source: "cybersarah-control-center" } },
    metadata: { cyberSarahUserId: String(user.id), source: "cybersarah-control-center" },
  });
  if (!session.url) throw new Error("Stripe hat keine Checkout-URL zurückgegeben.");
  return { url: session.url, sessionId: session.id };
}

export async function createLiveBillingPortalSession(user: { stripeCustomerId: string | null }) {
  if (!user.stripeCustomerId) throw new Error("Für dieses Konto existiert noch keine Stripe-Kundenbeziehung.");
  const stripe = assertLiveStripeConfiguration();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${getAppBaseUrl()}/account`,
  });
  return { url: portal.url };
}

async function resolveUserForSubscription(subscription: Stripe.Subscription) {
  const metadataUserId = Number(subscription.metadata.cyberSarahUserId);
  if (Number.isSafeInteger(metadataUserId) && metadataUserId > 0) return { id: metadataUserId };
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  return db.getUserByStripeCustomerId(customerId);
}

export async function syncStripeSubscription(subscription: Stripe.Subscription) {
  const user = await resolveUserForSubscription(subscription);
  if (!user) throw new Error("Stripe-Abonnement kann keinem CyberSarah-Konto zugeordnet werden.");
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  await db.setStripeCustomerId(user.id, customerId);
  await db.upsertBillingSubscription({
    userId: user.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  });
}

export async function processStripeWebhook(payload: Buffer, signature: string | undefined) {
  const stripe = assertLiveStripeConfiguration();
  if (!signature) throw new Error("Stripe-Signatur fehlt.");
  const event = stripe.webhooks.constructEvent(payload, signature, requiredEnvironment("STRIPE_WEBHOOK_SECRET"));
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await syncStripeSubscription(event.data.object as Stripe.Subscription);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = Number(session.client_reference_id ?? session.metadata?.cyberSarahUserId);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (Number.isSafeInteger(userId) && userId > 0 && customerId) await db.setStripeCustomerId(userId, customerId);
  }
  return { received: true, eventType: event.type };
}

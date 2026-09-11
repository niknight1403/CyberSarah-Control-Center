/**
 * Stripe-Checkout & nutzungsbasiertes Token-Metering (rein, testbar).
 *
 * Ergaenzt stripe-webhook-logic um den Checkout-Sessions-Flow
 * (`checkout.session.completed`) und um das Sammeln, Aggregieren und
 * Verrechnen nutzungsbasierter Token-Mengen je Modell. Nebeneffekte
 * (Stripe-API, DB) bleiben beim Server-Handler.
 */

import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "./subscription-tiers-logic";

export const CHECKOUT_EVENT_TYPES = ["checkout.session.completed", "checkout.session.expired"] as const;

export type CheckoutEventType = (typeof CHECKOUT_EVENT_TYPES)[number];

export type CheckoutSessionLike = {
  id: string;
  status: string;
  customer?: string | { id?: string } | null;
  customer_email?: string | null;
  metadata?: Record<string, string | null> | null;
};

export type CheckoutEffect =
  | { effect: "activate-subscription"; tier: SubscriptionTier; sessionId: string; email: string | null; customerId: string | null }
  | { effect: "none"; reason: string };

function customerIdOf(customer: CheckoutSessionLike["customer"]): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

/**
 * Abbildung eines Checkout-Events auf Datenbank-Effekte — analog zu
 * mapStripeEventToEffect in stripe-webhook-logic.
 */
export function mapCheckoutEventToEffect(type: string, session: CheckoutSessionLike | null | undefined): CheckoutEffect {
  if (type === "checkout.session.expired") {
    return { effect: "none", reason: "Checkout-Sitzung abgelaufen" };
  }
  if (type !== "checkout.session.completed" || !session) {
    return { effect: "none", reason: `Unbeachtetes Event: ${type}` };
  }
  if (session.status !== "complete") {
    return { effect: "none", reason: `Checkout-Status nicht abgeschlossen: ${session.status}` };
  }
  const tier = session.metadata?.tier;
  if (tier === null || tier === undefined || !(SUBSCRIPTION_TIERS as readonly string[]).includes(tier)) {
    return { effect: "none", reason: `Unbekannter Tier im Checkout: ${String(tier)}` };
  }
  const email = session.customer_email ?? null;
  return {
    effect: "activate-subscription",
    tier: tier as SubscriptionTier,
    sessionId: session.id,
    email,
    customerId: customerIdOf(session.customer),
  };
}

export type MeteredUsageEntry = {
  atMs: number;
  model: string;
  tokens: number;
  /** Kosten je 1k Tokens in Cent — fuer verbrauchsgenaue Abrechnung. */
  costPer1kCents: number;
};

/** Einzelne Nutzungsnachricht in das Konto einbuchen (unvergaenglich). */
export function recordMeteredUsage(
  ledger: readonly MeteredUsageEntry[],
  entry: MeteredUsageEntry,
): MeteredUsageEntry[] {
  if (!Number.isFinite(entry.tokens) || entry.tokens <= 0) return [...ledger];
  return [...ledger, { ...entry, model: entry.model.trim() || "unbekannt" }];
}

export type MeteredPeriodSummary = {
  entries: number;
  totalTokens: number;
  tokensByModel: Record<string, number>;
  /** Gesamtkosten in Cent (auf ganze Cent gerundet). */
  totalCostCents: number;
};

/** Nutzung im Zeitfenster [fromMs, toMs) aggregieren. */
export function aggregateMeteredPeriod(
  ledger: readonly MeteredUsageEntry[],
  fromMs: number,
  toMs: number,
): MeteredPeriodSummary {
  const inRange = ledger.filter((entry) => entry.atMs >= fromMs && entry.atMs < toMs);
  const tokensByModel: Record<string, number> = {};
  let totalTokens = 0;
  let totalCostCents = 0;
  for (const entry of inRange) {
    tokensByModel[entry.model] = (tokensByModel[entry.model] ?? 0) + entry.tokens;
    totalTokens += entry.tokens;
    totalCostCents += (entry.tokens / 1000) * entry.costPer1kCents;
  }
  return {
    entries: inRange.length,
    totalTokens,
    tokensByModel,
    totalCostCents: Math.round(totalCostCents * 100) / 100,
  };
}

/** Kompakte Berichtszeile fuer die Abrechnungsansicht. */
export function describeMeteredPeriod(summary: MeteredPeriodSummary, label: string): string {
  const models = Object.entries(summary.tokensByModel)
    .sort((a, b) => b[1] - a[1])
    .map(([model, tokens]) => `${model}: ${(tokens / 1000).toFixed(1)}k`)
    .join(", ");
  return `${label}: ${summary.totalTokens} Tokens (${summary.entries} Buchungen) — ${models || "keine Nutzung"} — Kosten ${(summary.totalCostCents / 100).toFixed(2)} EUR`;
}

export type CheckoutSessionInput = {
  tier: SubscriptionTier;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
};

export type CheckoutSessionRequest = {
  mode: "subscription";
  lineItems: { price: string; quantity: 1 }[];
  successUrl: string;
  cancelUrl: string;
  customerEmail: string | null;
  metadata: { tier: SubscriptionTier };
};

/** Stripe-Checkout-Session-Request deterministisch bauen und validieren. */
export function buildCheckoutSessionRequest(input: CheckoutSessionInput): CheckoutSessionRequest {
  if (!input.priceId.startsWith("price_")) {
    throw new Error(`Ungültige Price-ID: ${input.priceId}`);
  }
  for (const url of [input.successUrl, input.cancelUrl]) {
    if (!/^https:\/\//i.test(url)) throw new Error("Checkout-URLs müssen HTTPS verwenden");
  }
  if (input.customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.customerEmail)) {
    throw new Error("Ungültige Kunden-E-Mail");
  }
  return {
    mode: "subscription",
    lineItems: [{ price: input.priceId, quantity: 1 }],
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    customerEmail: input.customerEmail ?? null,
    metadata: { tier: input.tier },
  };
}

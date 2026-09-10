/**
 * Sprint 70 — Stripe-Webhook-Verarbeitung — reine Abbildungslogik.
 *
 * Stripe-Events (customer.subscription.created/updated/deleted,
 * invoice.payment_succeeded/invoice.payment_failed) werden deterministisch
 * auf Datenbank-Effekte abgebildet. Nebenwirkungen (DB, Stripe-API) fuehrt
 * ausschliesslich der Server-Handler aus — dieses Modul bleibt pure.
 */

import { type SubscriptionTier } from "./subscription-tiers-logic";

export const SUBSCRIPTION_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export type StripeSubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id?: string };
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  latest_invoice?: string | { id?: string } | null;
};

export type StripeItemLike = {
  price?: { id?: string | null } | null;
};

export type StripeEventLike = {
  id?: string | null;
  type: string;
  data?: {
    object?: unknown;
  };
};

export type WebhookEffect =
  | {
      kind: "upsert_subscription";
      stripeSubscriptionId: string;
      stripeCustomerId: string;
      stripePriceId: string | null;
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
    }
  | {
      kind: "mark_subscription_status";
      stripeSubscriptionId: string;
      status: string;
    }
  | { kind: "ignore" };

/** Stripe-Status -> persistierter Status (deutschlandtaugliche Werte). */
export function normalizeSubscriptionStatus(rawStatus: string | null | undefined): string {
  const status = (rawStatus ?? "").toLowerCase();
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  return "canceled";
}

/** Extrahiert den (ersten) Preis der Subscription-Items. */
export function subscriptionPriceId(subscription: StripeSubscriptionLike & { items?: unknown }): string | null {
  const items = subscription.items as { data?: StripeItemLike[] } | undefined;
  const first: StripeItemLike | undefined = items?.data?.[0];
  const priceId = first?.price?.id;
  return typeof priceId === "string" && priceId.trim() ? priceId.trim() : null;
}

function isSubscriptionObject(value: unknown): value is StripeSubscriptionLike & { items?: unknown } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; status?: unknown; customer?: unknown };
  const customerOk = typeof candidate.customer === "string" || (typeof candidate.customer === "object" && candidate.customer !== null);
  return typeof candidate.id === "string" && typeof candidate.status === "string" && customerOk;
}

/**
 * Abbildung eines (signaturverifizierten) Stripe-Events auf einen DB-Effekt.
 * Unbekannte Event-Typen werden ignoriert (idempotent, kein Fehler).
 */
export function mapStripeEventToEffect(
  event: StripeEventLike,
  options?: {
    /** Fuer invoice-Events: Lookup subscriptionId aus dem Event-Objekt. */
    subscriptionLoader?: (subscriptionId: string) => Promise<StripeSubscriptionLike | null>;
  },
): WebhookEffect {
  const object = event.data?.object;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!isSubscriptionObject(object)) return { kind: "ignore" };
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : normalizeSubscriptionStatus(object.status);
      return {
        kind: "upsert_subscription",
        stripeSubscriptionId: object.id,
        stripeCustomerId:
          typeof object.customer === "string" ? object.customer : ((object.customer as { id?: string })?.id ?? ""),
        stripePriceId: subscriptionPriceId(object),
        status,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000) : null,
      };
    }
    case "invoice.payment_succeeded": {
      // Rechnungszahlung erfolgreich: Status aktiviert sich ueber das
      // zugehoerige subscription.updated-Event; hier nur idempotente Aktivierung.
      return { kind: "ignore" };
    }
    case "invoice.payment_failed": {
      if (!isSubscriptionObject(object)) return { kind: "ignore" };
      return {
        kind: "mark_subscription_status",
        stripeSubscriptionId: object.id,
        status: "past_due",
      };
    }
    default:
      return { kind: "ignore" };
  }
}

/** Welche Events der Handler verarbeiten muss (Sortierung fuer Doku/Tests). */
export function isHandledEventType(type: string): type is SubscriptionEventType {
  return (SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(type);
}

/** Stufe aus Webhook-Preis ableiten (Delegation, damit Server schlank bleibt). */
export function tierFromWebhookPrice(
  priceId: string | null,
  env: Record<string, string | undefined>,
  tierFromPriceId: (priceId: string | null, env: Record<string, string | undefined>) => SubscriptionTier,
): SubscriptionTier {
  return tierFromPriceId(priceId, env);
}

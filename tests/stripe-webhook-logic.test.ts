import { describe, expect, it } from "vitest";

import {
  isHandledEventType,
  mapStripeEventToEffect,
  normalizeSubscriptionStatus,
  subscriptionPriceId,
} from "../lib/stripe-webhook-logic";

const SUBSCRIPTION = {
  id: "sub_123",
  status: "active",
  customer: "cus_456",
  current_period_end: 1789000000,
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_pro_222" } }] },
};

function event(type: string, object: unknown) {
  return { id: `evt_${type}`, type, data: { object } };
}

describe("stripe-webhook-logic", () => {
  it("normalisiert Stripe-Status in persistierbare Werte", () => {
    expect(normalizeSubscriptionStatus("active")).toBe("active");
    expect(normalizeSubscriptionStatus("trialing")).toBe("active");
    expect(normalizeSubscriptionStatus("past_due")).toBe("past_due");
    expect(normalizeSubscriptionStatus("unpaid")).toBe("unpaid");
    expect(normalizeSubscriptionStatus("canceled")).toBe("canceled");
    expect(normalizeSubscriptionStatus(null)).toBe("canceled");
  });

  it("extrahiert den Preis aus Subscription-Items", () => {
    expect(subscriptionPriceId(SUBSCRIPTION)).toBe("price_pro_222");
    expect(subscriptionPriceId({ ...SUBSCRIPTION, items: { data: [] } })).toBeNull();
  });

  it("bildet customer.subscription.created auf upsert_subscription ab", () => {
    const effect = mapStripeEventToEffect(event("customer.subscription.created", SUBSCRIPTION));
    expect(effect).toMatchObject({
      kind: "upsert_subscription",
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_456",
      stripePriceId: "price_pro_222",
      status: "active",
      cancelAtPeriodEnd: false,
    });
    if (effect.kind === "upsert_subscription") {
      expect(effect.currentPeriodEnd?.toISOString()).toBe(new Date(1789000000 * 1000).toISOString());
    }
  });

  it("markiert deleted-Events hart als canceled", () => {
    const effect = mapStripeEventToEffect(event("customer.subscription.deleted", { ...SUBSCRIPTION, status: "active" }));
    expect(effect).toMatchObject({ kind: "upsert_subscription", status: "canceled" });
  });

  it("uebernimmt cancel_at_period_end aus updated-Events", () => {
    const effect = mapStripeEventToEffect(event("customer.subscription.updated", { ...SUBSCRIPTION, cancel_at_period_end: true }));
    expect(effect).toMatchObject({ kind: "upsert_subscription", cancelAtPeriodEnd: true, status: "active" });
  });

  it("markiert invoice.payment_failed als past_due", () => {
    const effect = mapStripeEventToEffect(event("invoice.payment_failed", { ...SUBSCRIPTION, status: "open" }));
    expect(effect).toEqual({ kind: "mark_subscription_status", stripeSubscriptionId: "sub_123", status: "past_due" });
  });

  it("ignoriert invoice.payment_succeeded idempotent (Status kommt via subscription.updated)", () => {
    expect(mapStripeEventToEffect(event("invoice.payment_succeeded", SUBSCRIPTION))).toEqual({ kind: "ignore" });
  });

  it("ignoriert unbekannte und ungueltige Events", () => {
    expect(mapStripeEventToEffect(event("product.created", { object: "x" }))).toEqual({ kind: "ignore" });
    expect(mapStripeEventToEffect(event("customer.subscription.created", { id: "kein-sub" }))).toEqual({ kind: "ignore" });
    expect(isHandledEventType("customer.subscription.updated")).toBe(true);
    expect(isHandledEventType("checkout.session.completed")).toBe(false);
  });
});

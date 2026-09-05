import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStripeMode,
  isStripeSubscriptionEvent,
  validateStripeSecretKey,
} from "../server/billing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stripe configuration", () => {
  it("defaults to live mode and accepts only a live secret key", () => {
    expect(getStripeMode()).toBe("live");
    expect(() =>
      validateStripeSecretKey("sk_live_example", "live"),
    ).not.toThrow();
    expect(() => validateStripeSecretKey("sk_test_example", "live")).toThrow(
      /passt nicht/,
    );
  });

  it("accepts test keys only when test mode is explicit", () => {
    vi.stubEnv("STRIPE_MODE", "test");
    expect(getStripeMode()).toBe("test");
    expect(() =>
      validateStripeSecretKey("sk_test_example", "test"),
    ).not.toThrow();
    expect(() => validateStripeSecretKey("sk_live_example", "test")).toThrow(
      /passt nicht/,
    );
  });

  it("rejects unknown modes", () => {
    vi.stubEnv("STRIPE_MODE", "sandbox");
    expect(() => getStripeMode()).toThrow(/STRIPE_MODE/);
  });

  it("routes subscription lifecycle events for database synchronization", () => {
    expect(isStripeSubscriptionEvent("customer.subscription.created")).toBe(
      true,
    );
    expect(isStripeSubscriptionEvent("customer.subscription.updated")).toBe(
      true,
    );
    expect(isStripeSubscriptionEvent("customer.subscription.deleted")).toBe(
      true,
    );
    expect(isStripeSubscriptionEvent("customer.subscription.paused")).toBe(
      true,
    );
    expect(isStripeSubscriptionEvent("invoice.paid")).toBe(false);
  });
});

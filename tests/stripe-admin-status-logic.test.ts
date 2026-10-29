import { describe, expect, it } from "vitest";
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";

describe("Durable Stripe administrator configuration", () => {
  it("detects valid live and test keys without returning key material", () => {
    const live = stripeAdminSettings({
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_secretneverexpose",
      STRIPE_WEBHOOK_SECRET: "whsec_signingsecretneverexpose",
    });
    expect(live.phase).toBe("configured");
    expect(live.webhookReady).toBe(true);
    expect(JSON.stringify(live)).not.toContain("secretneverexpose");
    const test = stripeAdminSettings({
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "rk_test_readonlyexample",
    });
    expect(test.phase).toBe("configured");
    expect(test.webhookReady).toBe(false);
  });
  it("does not silently use a second Stripe account or misleading fallback", () => {
    const status = stripeAdminSettings({ STRIPE_MODE: "live", STRIPE_SECRET_KEY_2: "sk_live_secondaccount" });
    expect(status.phase).toBe("missing_key");
    expect(status.keyPresent).toBe(false);
  });
  it("blocks mixed test/live modes and unknown formats", () => {
    expect(stripeAdminSettings({
      STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_wrongmode",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_wrongmode",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "live", STRIPE_SECRET_KEY: "pk_live_publicnotsecret",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "unknown", STRIPE_SECRET_KEY: "sk_live_example",
    }).phase).toBe("invalid_mode");
  });
  it("honors durable server env across separate calls", () => {
    const environment = { STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_persistent", STRIPE_WEBHOOK_SECRET: "whsec_abcdefghijklmnopqrstuvwxyz" };
    expect(stripeAdminSettings(environment)).toEqual(stripeAdminSettings(environment));
  });
});

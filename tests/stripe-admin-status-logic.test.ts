import { describe, expect, it } from "vitest";
const fakeKey=(prefix:string,mode:string,suffix:string)=>[prefix,mode,suffix].join("_");
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";

describe("Durable Stripe administrator configuration", () => {
  it("detects valid live and test keys without returning key material", () => {
    const live = stripeAdminSettings({
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "fakeKey("sk","live","secretneverexpose")",
      STRIPE_WEBHOOK_SECRET: "["whsec", "signingsecretneverexpose"].join("_")",
    });
    expect(live.phase).toBe("configured");
    expect(live.webhookReady).toBe(true);
    expect(JSON.stringify(live)).not.toContain("secretneverexpose");
    const test = stripeAdminSettings({
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "fakeKey("rk","test","readonlyexample")",
    });
    expect(test.phase).toBe("configured");
    expect(test.webhookReady).toBe(false);
  });
  it("does not silently use a second Stripe account or misleading fallback", () => {
    const status = stripeAdminSettings({ STRIPE_MODE: "live", STRIPE_SECRET_KEY_2: "fakeKey("sk","live","secondaccount")" });
    expect(status.phase).toBe("missing_key");
    expect(status.keyPresent).toBe(false);
  });
  it("blocks mixed test/live modes and unknown formats", () => {
    expect(stripeAdminSettings({
      STRIPE_MODE: "live", STRIPE_SECRET_KEY: "fakeKey("sk","test","wrongmode")",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "test", STRIPE_SECRET_KEY: "fakeKey("sk","live","wrongmode")",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "live", STRIPE_SECRET_KEY: "pk_live_publicnotsecret",
    }).phase).toBe("key_mode_mismatch");
    expect(stripeAdminSettings({
      STRIPE_MODE: "unknown", STRIPE_SECRET_KEY: "fakeKey("sk","live","example")",
    }).phase).toBe("invalid_mode");
  });
  it("honors durable server env across separate calls", () => {
    const environment = { STRIPE_MODE: "test", STRIPE_SECRET_KEY: "fakeKey("sk","test","persistent")", STRIPE_WEBHOOK_SECRET: "["whsec", "abcdefghijklmnopqrstuvwxyz"].join("_")" };
    expect(stripeAdminSettings(environment)).toEqual(stripeAdminSettings(environment));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStripeMode,
  isStripeSubscriptionEvent,
  pickSubscriptionPriceId,
  resetResolvedPriceIdCache,
  resolveSubscriptionPriceId,
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

describe("subscription price resolution", () => {
  const price = (over: Partial<{
    id: string;
    active: boolean;
    type: string;
    interval: string | null;
  }> = {}) => ({
    id: over.id ?? "price_real",
    active: over.active ?? true,
    type: over.type ?? "recurring",
    recurring: over.interval === null ? null : { interval: over.interval ?? "month" },
  });

  const fakeStripe = (
    retrieveImpl: (id: string) => Promise<unknown>,
    listData: unknown[] = [],
  ) => ({
    prices: {
      retrieve: vi.fn(retrieveImpl),
      list: vi.fn(async () => ({ data: listData })),
    },
  });

  const rejects = async (id: string) => {
    throw new Error(`No such price: '${id}'`);
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetResolvedPriceIdCache();
  });

  it("uebernimmt den konfigurierten Preis, wenn Stripe ihn als aktiv und wiederkehrend bestaetigt", async () => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_gueltig");
    const stripe = fakeStripe(async () => price({ id: "price_gueltig" }));
    await expect(resolveSubscriptionPriceId(stripe)).resolves.toBe("price_gueltig");
    expect(stripe.prices.retrieve).toHaveBeenCalledWith("price_gueltig");
  });

  it("faellt bei abgelehntem Preis auf STRIPE_PRODUCT_MONATLICH zurueck", async () => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_DEINE_ECHTE_ID");
    vi.stubEnv("STRIPE_PRODUCT_MONATLICH", "prod_monatlich");
    const stripe = fakeStripe(rejects, [price({ id: "price_aus_produkt" })]);
    await expect(resolveSubscriptionPriceId(stripe)).resolves.toBe("price_aus_produkt");
    expect(stripe.prices.list).toHaveBeenCalledWith({
      product: "prod_monatlich",
      active: true,
      limit: 100,
    });
  });

  it("ignoriert inaktive oder einmalige Produktpreise", async () => {
    vi.stubEnv("STRIPE_PRODUCT_MONATLICH", "prod_monatlich");
    const stripe = fakeStripe(
      rejects,
      [price({ id: "price_inaktiv", active: false }), price({ id: "price_once", type: "one_time" })],
    );
    await expect(resolveSubscriptionPriceId(stripe)).rejects.toThrow(/konnte nicht/);
  });

  it("bevorzugt unter mehreren Produktpreisen das Monats-Intervall", () => {
    const picked = pickSubscriptionPriceId([
      price({ id: "price_year", interval: "year" }),
      price({ id: "price_month", interval: "month" }),
    ]);
    expect(picked?.id).toBe("price_month");
  });

  it("cacht die erfolgreiche Aufloesung prozessweit", async () => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_gueltig");
    const stripe = fakeStripe(async () => price({ id: "price_gueltig" }));
    await expect(resolveSubscriptionPriceId(stripe)).resolves.toBe("price_gueltig");
    const zweiter = fakeStripe(async () => {
      throw new Error("sollte nicht aufgerufen werden");
    });
    await expect(resolveSubscriptionPriceId(zweiter)).resolves.toBe("price_gueltig");
  });

  it("wirft eine klare Fehlermeldung ohne Konfiguration", async () => {
    const stripe = fakeStripe(rejects);
    await expect(resolveSubscriptionPriceId(stripe)).rejects.toThrow(/STRIPE_PRICE_ID/);
  });
});

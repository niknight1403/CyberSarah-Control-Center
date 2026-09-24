import { describe, expect, it } from "vitest";

import { RECOMMENDED_TIER, buildTierPresentations, checkoutAvailability, formatPrice, tierPriceCents } from "../lib/pricing-logic";

describe("pricing logic (Sprint 265)", () => {
  const env = { TIER_PRICE_CENTS_LITE: "990", TIER_PRICE_CENTS_PRO: "2900", TIER_PRICE_CENTS_EXPERT: "8900" };

  it("liest Preise aus ENV in Cent, nie hart aus UI", () => {
    expect(tierPriceCents("lite", env)).toBe(990);
    expect(tierPriceCents("lite", {})).toBeNull();
    expect(tierPriceCents("lite", { TIER_PRICE_CENTS_LITE: "abc" })).toBeNull();
  });

  it("formatiert deutsch mit Komma, unkonfiguriert bleibt ehrlich", () => {
    expect(formatPrice(990)).toBe("9,90 € / Monat");
    expect(formatPrice(null)).toBe("Preis auf Anfrage");
  });

  it("Praesentation nennt Empfehlung, Freischaltungen UND Grenzen", () => {
    const tiers = buildTierPresentations(env);
    expect(tiers).toHaveLength(3);
    const pro = tiers.find((tier) => tier.tier === "pro")!;
    expect(pro.recommended).toBe(true);
    expect(RECOMMENDED_TIER).toBe("pro");
    expect(pro.entitlements).toContain("agent");
    expect(pro.limitations.length).toBeGreaterThan(0);
    const expert = tiers.find((tier) => tier.tier === "expert")!;
    expect(expert.limitations.join(" ")).toContain("Keine Garantie von Umsätzen");
  });

  it("Checkout nur mit konfigurierter Stripe-Preis-ID", () => {
    expect(checkoutAvailability("pro", { ...env, STRIPE_PRICE_ID_PRO: "price_pro" }).checkoutable).toBe(true);
    const missing = checkoutAvailability("pro", env);
    expect(missing.checkoutable).toBe(false);
    expect(missing.reason).toContain("STRIPE_PRICE_ID_PRO");
  });
});

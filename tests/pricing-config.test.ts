import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CREDIT_PACKS_CANONICAL,
  creditPackCatalog,
  findCreditPack,
  findCreditPackByPriceId,
  stripePriceIdFor,
  stripeSellablePacks,
} from "../lib/pricing-config";
import { decideQuotaWithLedger } from "../lib/monetization-logic";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CREDIT_PACKS_CANONICAL", () => {
  it("hält die drei Pakete mit den vereinbarten Mengen und Preisen", () => {
    expect(CREDIT_PACKS_CANONICAL.map((pack) => [pack.tokens, pack.priceEur])).toEqual([
      [50_000, 4.99],
      [250_000, 19.99],
      [1_000_000, 59.99],
    ]);
  });

  it("nennt für jedes Paket Stripe-Env und Play-Kennungen", () => {
    for (const pack of CREDIT_PACKS_CANONICAL) {
      expect(pack.stripePriceEnv).toMatch(/^STRIPE_PRICE_/);
      expect(pack.playProductIds.length).toBeGreaterThanOrEqual(2);
      expect(pack.playProductIds).toContain(pack.id);
      expect(pack.playProductIds).toContain(pack.legacyId);
    }
  });
});

describe("findCreditPack", () => {
  it("findet kanonische und alte Kennungen", () => {
    expect(findCreditPack("credit_pack_small")?.tokens).toBe(50_000);
    expect(findCreditPack("credits_medium")?.tokens).toBe(250_000);
  });

  it("ist unabhängig von Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(findCreditPack("  CREDIT_PACK_LARGE ")?.tokens).toBe(1_000_000);
  });

  it("gibt bei unbekannter Kennung null statt eines Wunschwerts", () => {
    expect(findCreditPack("credit_pack_mega")).toBeNull();
    expect(findCreditPack("")).toBeNull();
  });

  it("findet über die Stripe-Preis-ID, wenn sie konfiguriert ist", () => {
    vi.stubEnv("STRIPE_PRICE_SMALL", "price_small_123");
    expect(findCreditPack("", "price_small_123")?.id).toBe("credit_pack_small");
    expect(findCreditPackByPriceId("price_small_123")?.tokens).toBe(50_000);
  });

  it("ignoriert ungültige Preis-IDs", () => {
    vi.stubEnv("STRIPE_PRICE_SMALL", "kein_preis");
    expect(stripePriceIdFor(CREDIT_PACKS_CANONICAL[0])).toBeNull();
    expect(stripeSellablePacks()).toHaveLength(0);
  });
});

describe("creditPackCatalog", () => {
  it("kennzeichnet Stripe-Verfügbarkeit ehrlich", () => {
    vi.stubEnv("STRIPE_PRICE_MEDIUM", "price_medium_1");
    const catalog = creditPackCatalog();
    expect(catalog.find((pack) => pack.id === "credit_pack_medium")?.stripeAvailable).toBe(true);
    expect(catalog.find((pack) => pack.id === "credit_pack_small")?.stripeAvailable).toBe(false);
  });

  it("liefert nur kaufbare Pakete über stripeSellablePacks", () => {
    vi.stubEnv("STRIPE_PRICE_SMALL", "price_small_1");
    vi.stubEnv("STRIPE_PRICE_LARGE", "price_large_1");
    expect(stripeSellablePacks().map((pack) => pack.id)).toEqual(["credit_pack_small", "credit_pack_large"]);
  });
});

describe("decideQuotaWithLedger", () => {
  const base = {
    allowed: false,
    limitKind: "daily" as const,
    usesCredits: false,
    remainingToday: 0,
    remainingThisMonth: 5000,
  };

  it("lässt erlaubte Läufe unverändert und nennt die Quelle", () => {
    const decision = decideQuotaWithLedger({ ...base, allowed: true, remainingToday: 900 }, 0, 500);
    expect(decision.allowed).toBe(true);
    expect(decision.fundedBy).toBe("plan");
  });

  it("deckt einen Fehlbetrag aus dem Ledger", () => {
    const decision = decideQuotaWithLedger(base, 10_000, 2_000);
    expect(decision.allowed).toBe(true);
    expect(decision.usesCredits).toBe(true);
    expect(decision.fundedBy).toBe("ledger");
  });

  it("erlaubt, wenn das Kontingent den Lauf doch noch deckt", () => {
    const decision = decideQuotaWithLedger({ ...base, remainingToday: 3_000 }, 0, 2_000);
    expect(decision.allowed).toBe(false);
    expect(decision.fundedBy).toBe("none");
  });

  it("blockiert, wenn das Ledger zu klein ist", () => {
    const decision = decideQuotaWithLedger(base, 10, 2_000);
    expect(decision.allowed).toBe(false);
    expect(decision.fundedBy).toBe("none");
  });

  it("blockiert, wenn das Guthaben unbekannt ist", () => {
    const decision = decideQuotaWithLedger(base, null, 2_000);
    expect(decision.allowed).toBe(false);
    expect(decision.fundedBy).toBe("none");
  });
});

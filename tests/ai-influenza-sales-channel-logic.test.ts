import { describe, it, expect } from "vitest";
import {
  digistore24PaymentPlanDraft,
  planDigistore24CatalogEntry,
  planSalesCatalog,
  planStripeCatalogEntry,
  stripeIdempotencyKey,
  stripeLookupKey,
  toMajorUnits,
} from "../lib/ai-influenza-sales-channel-logic";
import { AI_INFLUENZA_PACKAGES } from "../lib/ai-influenza-team-logic";

describe("toMajorUnits", () => {
  it("rechnet Cent in Hauptwaehrung", () => {
    expect(toMajorUnits(29900)).toBe(299);
    expect(toMajorUnits(1234)).toBe(12.34);
    expect(toMajorUnits(0)).toBe(0);
  });

  it("weist unbrauchbare Betraege zurueck", () => {
    expect(() => toMajorUnits(-1)).toThrow(/unbrauchbar/);
    expect(() => toMajorUnits(Number.NaN)).toThrow(/unbrauchbar/);
  });
});

describe("planStripeCatalogEntry", () => {
  it("legt Produkt und monatlichen Preis mit Lookup-Key an", () => {
    const plan = planStripeCatalogEntry("growth");
    expect(plan.action).toBe("create");
    expect(plan.steps.map((step) => step.method)).toEqual(["products.create", "prices.create"]);
    const price = plan.steps[1].payload;
    expect(price.currency).toBe("eur");
    expect(price.unit_amount).toBe(99900);
    expect(price.recurring).toEqual({ interval: "month" });
    expect(price.lookup_key).toBe(stripeLookupKey("growth"));
    expect(plan.envTarget).toBe("STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH");
    expect(plan.blockers).toEqual([]);
  });

  it("ueberspringt ein bereits verdrahtetes Preis-Objekt", () => {
    const plan = planStripeCatalogEntry("starter", { existingPriceId: "price_123" });
    expect(plan.action).toBe("skip");
    expect(plan.steps).toEqual([]);
  });

  it("meldet eine falsche Preis-ID als Blocker, statt sie zu benutzen", () => {
    const plan = planStripeCatalogEntry("starter", { existingPriceId: "prod_123" });
    expect(plan.action).toBe("skip");
    expect(plan.blockers[0]).toContain("beginnt nicht mit price_");
  });

  it("aendert den Idempotenz-Schluessel mit dem Preis", () => {
    expect(stripeIdempotencyKey("business")).toBe(
      `ai-influenza-catalog-business-${AI_INFLUENZA_PACKAGES.business.monthlyPriceCents}`,
    );
  });
});

describe("planDigistore24CatalogEntry", () => {
  it("nutzt die Feldnamen der Digistore24-API in snake_case", () => {
    const plan = planDigistore24CatalogEntry("growth", {
      salespageUrl: "https://app.cybersarah-ki.com/ai-influenza",
      thankyouUrl: "https://app.cybersarah-ki.com/danke",
      imageUrl: "https://app.cybersarah-ki.com/og.png",
      apiKeyConfigured: true,
    });
    const product = plan.steps[0].payload.data as Record<string, unknown>;
    expect(plan.steps[0].method).toBe("createProduct");
    expect(product.name_intern).toBe("ai-influenza-growth");
    expect(product.name_de).toBe("AI Influenza Team Growth");
    expect(product.salespage_url).toBe("https://app.cybersarah-ki.com/ai-influenza");
    expect(product.thankyou_url).toBe("https://app.cybersarah-ki.com/danke");
    expect(product.image_url).toBe("https://app.cybersarah-ki.com/og.png");
    expect(plan.blockers).toEqual([]);
  });

  it("legt den Preis in den Zahlungsplan, nicht ins Produkt", () => {
    const plan = planDigistore24CatalogEntry("business", {
      salespageUrl: "https://x.de/p",
      thankyouUrl: "https://x.de/t",
      apiKeyConfigured: true,
    });
    const product = plan.steps[0].payload.data as Record<string, unknown>;
    expect(product).not.toHaveProperty("price");
    const draft = digistore24PaymentPlanDraft("business");
    const data = draft.payload.data as Record<string, unknown>;
    expect(data.first_amount).toBe(2499);
    expect(data.other_amounts).toBe(2499);
    expect(data.currency).toBe("EUR");
  });

  it("verlangt Freigabe fuer den Zahlungsplan und laesst ihn inaktiv", () => {
    const draft = digistore24PaymentPlanDraft("starter");
    expect(draft.requiresReview).toBe(true);
    expect(draft.usesResultOf).toBe("createProduct");
    expect((draft.payload.data as Record<string, unknown>).is_active).toBe(false);
    expect(draft.note).toContain("is_active=false");
  });

  it("sammelt Blocker, wenn Schluessel oder Seiten fehlen", () => {
    const plan = planDigistore24CatalogEntry("starter");
    expect(plan.action).toBe("create");
    expect(plan.blockers).toEqual([
      "DIGISTORE24_API_KEY fehlt.",
      "salespage_url fehlt — Digistore24 braucht eine Verkaufsseite.",
      "thankyou_url fehlt — ohne Danke-Seite keine Auslieferung.",
    ]);
  });

  it("ueberspringt ein vorhandenes Produkt", () => {
    const plan = planDigistore24CatalogEntry("starter", { existingProductId: "12345", apiKeyConfigured: true });
    expect(plan.action).toBe("skip");
    expect(plan.reason).toContain("12345");
  });
});

describe("planSalesCatalog", () => {
  it("deckt drei Pakete auf zwei Kanaelen ab", () => {
    const result = planSalesCatalog({ env: {} });
    expect(result.plans).toHaveLength(6);
    expect(result.plans.filter((plan) => plan.channel === "stripe")).toHaveLength(3);
    expect(result.plans.filter((plan) => plan.channel === "digistore24")).toHaveLength(3);
  });

  it("ohne Schluessel und Seiten ist der Digistore24-Teil blockiert, Stripe nicht", () => {
    const result = planSalesCatalog({ env: {} });
    expect(result.blocked).toBe(3);
    expect(result.creatable).toBe(3);
    expect(result.needsReview).toBe(3);
  });

  it("mit vollstaendiger Konfiguration bleibt nur die Freigabe offen", () => {
    const result = planSalesCatalog({
      env: { DIGISTORE24_API_KEY: "key" },
      digistore24: { salespageUrl: "https://x.de/p", thankyouUrl: "https://x.de/t" },
    });
    expect(result.blocked).toBe(0);
    expect(result.creatable).toBe(6);
    expect(result.needsReview).toBe(3);
  });

  it("respektiert vorhandene Preis- und Produkt-IDs", () => {
    const result = planSalesCatalog({
      env: {
        STRIPE_AI_INFLUENZA_PRICE_ID_STARTER: "price_a",
        STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH: "price_b",
        STRIPE_AI_INFLUENZA_PRICE_ID_BUSINESS: "price_c",
        DIGISTORE24_API_KEY: "key",
        DIGISTORE24_PRODUCT_ID_STARTER: "111",
      },
      digistore24: { salespageUrl: "https://x.de/p", thankyouUrl: "https://x.de/t" },
    });
    expect(result.plans.every((plan) => plan.channel !== "stripe" || plan.action === "skip")).toBe(true);
    expect(result.creatable).toBe(2);
  });
});

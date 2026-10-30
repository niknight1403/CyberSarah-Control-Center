import { describe, expect, it } from "vitest";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";
const product = { id: "prod_sample", name: "CyberSarah Kurs", active: true, default_price: "price_month", metadata: { asset_rights: "owner_verified", affiliate: "true" } };
const monthly = { id: "price_month", product: "prod_sample", active: true, currency: "eur", unit_amount: 7900, type: "recurring", recurring: { interval: "month", interval_count: 1 }, tax_behavior: "inclusive" };
describe("Sprints 21-23 and 27 – Stripe catalogue correctness", () => {
  it("preserves recurring interval, currency, minor units and tax mode", () => {
    const x = projectStripeCatalog([product], [monthly], true, true);
    expect(x).toMatchObject({complete:true,productCount:1,priceCount:1});
    expect(x.prices[0]).toMatchObject({ amountMinor:7900, currency:"eur", billing:"recurring", interval:"month", intervalCount:1, taxBehavior:"inclusive" });
    expect(x.products[0].priceCount).toBe(1);
  });
  it("never counts unverified Stripe metadata claims as independently checked media/affiliate rights", () => {
    const x=projectStripeCatalog([product], [monthly], true, true);
    expect(x.products[0]).toMatchObject({rightsVerified:false,affiliateDisclosureVerified:false});
  });
  it("deduplicates product and price IDs instead of multiplying counted revenue offers", () => {
    const x=projectStripeCatalog([product, product], [monthly, monthly], true, true);
    expect(x).toMatchObject({productCount:1,priceCount:1,skippedDuplicateProducts:1,skippedDuplicatePrices:1});
    expect(x.problems.length).toBeGreaterThan(0);
  });
  it("shows inactive prices, missing default prices and orphaned variants", () => {
    const x=projectStripeCatalog([{...product,active:false}], [{...monthly,active:false}, {...monthly,id:"price_orphan",product:"prod_missing"}], true, true);
    expect(x.products[0].issues).toContain("Stripe-Produkt inaktiv");
    expect(x.products[0].issues).toContain("Standardpreis inaktiv");
    expect(x.prices[1].issues).toContain("Produktverweis fehlt oder Katalog unvollstaendig");
  });
  it("never claims complete catalogue after page cap", () => {
    const x=projectStripeCatalog([product], [monthly], false, false);
    expect(x.complete).toBe(false);
    expect(x.problems.length).toBe(2);
  });
  it("does not invent currency or price for invalid provider amounts", () => {
    const x=projectStripeCatalog([product], [{...monthly,unit_amount:null,currency:"invalid"}], true, true);
    expect(x.prices[0].amountMinor).toBeNull();
    expect(x.prices[0].issues).toContain("Betrag nicht eindeutig");
    expect(x.prices[0].issues).toContain("Waehrung ungueltig");
  });
  it("recurring price needs real subscription interval", () => {
    const x=projectStripeCatalog([product], [{...monthly, recurring:null}], true, true);
    expect(x.prices[0].issues).toContain("Abo-Intervall unvollstaendig");
  });
  it("standard price missing from catalog remains visible for admin review", () => {
    const x=projectStripeCatalog([product], [], true, false);
    expect(x.products[0].issues).toContain("Standardpreis nicht im erfassten Preiskatalog");
  });
});

import { describe, expect, it } from "vitest";
import { mapStripeProductToDraft, readStripeCatalogue, type StripeProductInput } from "../lib/commerce-catalog-logic";
const makeProduct = (n: number): StripeProductInput => ({
  id: "prod_" + String(n).padStart(7, "0"),
  name: "Digitales Produkt " + n,
  active: true, images: [],
  metadata: { product_type: "digital" },
  default_price: { id: "price_" + n, currency: "eur", unit_amount: 7900,
    tax_behavior: "exclusive" },
});
describe("Stripe Commerce catalogue import mapping", () => {
  it("paginates 100 products without losing or duplicating records", async () => {
    const all = Array.from({ length: 100 }, (_, i) => makeProduct(i + 1));
    const seen: Array<string | undefined> = [];
    const result = await readStripeCatalogue(async cursor => {
      seen.push(cursor);
      const start = cursor ? all.findIndex(p => p.id === cursor) + 1 : 0;
      return { data: all.slice(start, start + 30), has_more: start + 30 < all.length };
    });
    expect(result.products).toHaveLength(100);
    expect(new Set(result.products.map(p => p.id)).size).toBe(100);
    expect(result.pages).toBe(4);
    expect(result.complete).toBe(true);
    expect(seen).toEqual([undefined, all[29].id, all[59].id, all[89].id]);
  });
  it("reports incomplete pagination instead of claiming full import", async () => {
    const all = Array.from({ length: 100 }, (_, i) => makeProduct(i + 1));
    const result = await readStripeCatalogue(async cursor => {
      const start = cursor ? all.findIndex(p => p.id === cursor) + 1 : 0;
      return { data: all.slice(start, start + 25), has_more: start + 25 < all.length };
    }, 2);
    expect(result.products).toHaveLength(50);
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(2);
  });
  it("does not accept repeated cursor loops or empty has_more pages", async () => {
    await expect(readStripeCatalogue(async () => ({ data: [], has_more: true }))).rejects.toThrow();
  });
  it("preserves EUR cents, explicit VAT behavior, price source and review status", () => {
    const map = mapStripeProductToDraft(makeProduct(7), "2026-10-29T20:00:00Z");
    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(map.offer.priceCents).toBe(7900);
    expect(map.offer.metadata.taxBehavior).toBe("exclusive");
    expect(map.offer.metadata.stripePriceId).toBe("price_7");
    expect(map.offer.metadata.reviewRequired).toBe(true);
    expect(map.offer.status).toBe("draft");
    expect(map.offer.marginPct).toBeNull();
  });
  it("does not misstate a USD price as EUR", () => {
    const product = makeProduct(8);
    product.default_price = { id: "price_usd", currency: "usd", unit_amount: 9900 };
    const map = mapStripeProductToDraft(product, "2026-10-29T20:00:00Z");
    if (!map.ok) throw new Error(map.reason);
    expect(map.offer.priceCents).toBeNull();
    expect(map.offer.metadata.stripeCurrency).toBe("usd");
    expect(map.offer.metadata.priceCurrencyReviewRequired).toBe(true);
  });
  it("classifies known physical products, preserves unknown products for review", () => {
    const physical = makeProduct(9);
    physical.metadata.product_type = "physical";
    const p = mapStripeProductToDraft(physical, "2026-10-29T20:00:00Z");
    if (!p.ok) throw new Error(p.reason);
    expect(p.offer.kind).toBe("physical");
    const unknown = makeProduct(10);
    delete unknown.metadata.product_type;
    const u = mapStripeProductToDraft(unknown, "2026-10-29T20:00:00Z");
    if (!u.ok) throw new Error(u.reason);
    expect(u.offer.kind).toBe("unclassified");
    expect(u.offer.metadata.productTypeReviewRequired).toBe(true);
  });
  it("marks image rights as unknown and drops non-HTTPS media references", () => {
    const product = makeProduct(11);
    product.images = ["https://example.test/img.png", "http://example.test/a.jpg",
      "https://bad:secret@example.test/private"];
    const mapped = mapStripeProductToDraft(product, "2026-10-29T20:00:00Z");
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.offer.metadata.assetImageUrls).toEqual(["https://example.test/img.png"]);
    expect(mapped.offer.metadata.assetRightsVerified).toBe(false);
    expect(mapped.offer.metadata.mediaUsageApprovalRequired).toBe(true);
  });
  it("tracks subscription interval without pretending the interval price is one-off", () => {
    const product = makeProduct(12);
    product.default_price = { id: "price_sub", currency: "eur",
      unit_amount: 1900, recurring: { interval: "month", interval_count: 1 } };
    const result = mapStripeProductToDraft(product, "2026-10-29T20:00:00Z");
    if (!result.ok) throw new Error(result.reason);
    expect(result.offer.kind).toBe("subscription");
    expect(result.offer.metadata.recurringInterval).toBe("month");
  });
  it("refuses malformed Stripe products and never promotes them to live", () => {
    const invalid = mapStripeProductToDraft({
      ...makeProduct(13), id: "unsafe", active: true,
    }, "2026-10-29T20:00:00Z");
    expect(invalid.ok).toBe(false);
    const suspended = mapStripeProductToDraft({
      ...makeProduct(14), active: false,
    }, "2026-10-29T20:00:00Z");
    expect(suspended.ok).toBe(false);
  });
  it("does not trust merchant-declared owner_verified as proof of media rights", () => {
    const product = makeProduct(21);
    product.metadata.asset_rights = "owner_verified";
    product.images = ["https://cdn.example.org/claimed-image.jpg"];
    const mapped = mapStripeProductToDraft(product,"2026-10-29T22:00:00Z");
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.offer.metadata.assetRightsClaimed).toBe(true);
    expect(mapped.offer.metadata.assetRightsVerified).toBe(false);
    expect(mapped.offer.metadata.mediaUsageApprovalRequired).toBe(true);
  });
  it("preserves affiliate disclosures without automatically authorizing publications", () => {
    const product = makeProduct(22);
    product.metadata.product_type = "affiliate";
    product.metadata.affiliate_disclosure = "Werbung / Affiliate-Link";
    const mapped = mapStripeProductToDraft(product,"2026-10-29T22:00:00Z");
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.offer.kind).toBe("affiliate");
    expect(mapped.offer.metadata.affiliateDisclosure).toBe("Werbung / Affiliate-Link");
    expect(mapped.offer.metadata.affiliateDisclosureReviewRequired).toBe(true);
    expect(mapped.offer.status).toBe("draft");
  });

});

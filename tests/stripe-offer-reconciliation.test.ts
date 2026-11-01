import { describe, expect, it } from "vitest";
import { reconcileStripeOfferRefs } from "../lib/stripe-offer-reconciliation";
const ref = (id: number, productId: unknown, source = "stripe") => ({
  id, metadata: { source, stripeProductId: productId },
});
describe("Sprint 23 – reconciling imported offer drafts with Stripe", () => {
  it("detects orphaned products and imported duplicate IDs with full source coverage", () => {
    const v = reconcileStripeOfferRefs([
      ref(1,"prod_ok"), ref(2,"prod_ok"), ref(3,"prod_missing"), ref(4,null),
      ref(5,"prod_fake","manual"),
    ], new Set(["prod_ok"]), true, true);
    expect(v).toMatchObject({importedOffersChecked:4,missingSourceId:1,comparisonComplete:true});
    expect(v.duplicateProductIds).toEqual(["prod_ok"]);
    expect(v.orphanProductIds).toEqual(["prod_missing"]);
  });
  it("never invents local offer orphans if Stripe or DB catalog is incomplete", () => {
    const partial = reconcileStripeOfferRefs([ref(1,"prod_unknown")], new Set(), false, true);
    expect(partial.orphanProductIds).toEqual([]);
    expect(partial.unverifiedMissingProductIds).toEqual(["prod_unknown"]);
    const dbTruncated = reconcileStripeOfferRefs([ref(1,"prod_unknown")], new Set(), true, false);
    expect(dbTruncated.comparisonComplete).toBe(false);
    expect(dbTruncated.orphanProductIds).toEqual([]);
  });
});

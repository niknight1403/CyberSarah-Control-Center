/**
 * Compare imported local drafts with Stripe product IDs. No DB mutations.
 * A missing Stripe product is only an "orphan" when the remote catalogue was
 * fully paginated; otherwise report incomplete evidence.
 */
export type ImportedOfferRef = { id: number; metadata: Record<string,unknown> };
export function reconcileStripeOfferRefs(
  offers: readonly ImportedOfferRef[], productIds: ReadonlySet<string>,
  complete: boolean, localQueryComplete: boolean,
) {
  const counts = new Map<string, number>();
  let missingSourceId = 0, checked = 0;
  const unmatched = new Set<string>();
  for (const offer of offers) {
    if (offer.metadata.source !== "stripe") continue;
    checked++;
    const id = offer.metadata.stripeProductId;
    if (typeof id !== "string" || !id.startsWith("prod_")) {
      missingSourceId++;
      continue;
    }
    counts.set(id,(counts.get(id) ?? 0)+1);
    if (!productIds.has(id)) unmatched.add(id);
  }
  return {
    importedOffersChecked: checked,
    missingSourceId,
    duplicateProductIds: [...counts].filter(([,count]) => count > 1).map(([id]) => id),
    orphanProductIds: complete && localQueryComplete ? [...unmatched] : [],
    unverifiedMissingProductIds: complete && localQueryComplete ? [] : [...unmatched],
    comparisonComplete: complete && localQueryComplete,
    localQueryComplete,
  };
}

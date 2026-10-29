/**
 * Stripe -> local draft catalogue mapping. Pure and dependency-free.
 * Product facts are provenance-stamped; media rights remain unknown unless
 * verified independently. No checkout, activation or price write occurs.
 */
export type StripeProductInput = {
  id: string;
  name: string;
  active: boolean;
  metadata: Record<string, string>;
  images: string[];
  default_price?: string | null | {
    id: string;
    active?: boolean;
    currency: string;
    unit_amount: number | null;
    tax_behavior?: string | null;
    recurring?: { interval: string; interval_count?: number } | null;
  };
};
export type NormalizedOffer = {
  name: string;
  kind: string;
  status: "draft";
  priceCents: number | null;
  marginPct: null;
  targetUrl: null;
  metadata: Record<string, unknown>;
};
export type CatalogueMapResult =
  | { ok: true; offer: NormalizedOffer; productId: string }
  | { ok: false; productId: string; reason: string };

const productKinds = new Set(["digital", "physical", "subscription", "affiliate", "b2b", "lead-magnet"]);
export function mapStripeProductToDraft(input: StripeProductInput, importedAt: string): CatalogueMapResult {
  if (!/^prod_[A-Za-z0-9]+$/.test(input.id)) {
    return { ok: false, productId: input.id, reason: "Ungueltige Stripe-Produkt-ID." };
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 220 || !input.active) {
    return { ok: false, productId: input.id, reason: "Name ungueltig oder Produkt deaktiviert." };
  }
  const price = input.default_price;
  const expanded = typeof price === "object" && price !== null ? price : null;
  const currency = expanded?.currency?.toLowerCase() ?? null;
  const unit = expanded?.unit_amount;
  const validPrice = expanded?.active !== false && currency === "eur" &&
    Number.isSafeInteger(unit) && (unit ?? -1) >= 0;
  const priceCents = validPrice ? unit! : null;
  const announcedKind = String(input.metadata.product_type ?? "").toLowerCase();
  const kind = expanded?.recurring ? "subscription"
    : productKinds.has(announcedKind) ? announcedKind : "unclassified";
  const images = input.images.filter(url => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch { return false; }
  }).slice(0, 10);
  const explicitlyVerifiedRights = input.metadata.asset_rights === "owner_verified";
  return {
    ok: true,
    productId: input.id,
    offer: {
      name,
      kind,
      status: "draft",
      priceCents,
      marginPct: null,
      targetUrl: null,
      metadata: {
        source: "stripe",
        stripeProductId: input.id,
        stripePriceId: typeof price === "string" ? price : expanded?.id ?? null,
        stripeCurrency: currency,
        stripeUnitAmount: Number.isSafeInteger(unit) ? unit : null,
        priceCurrencyReviewRequired: currency !== "eur" || !validPrice,
        taxBehavior: expanded?.tax_behavior ?? "unspecified",
        recurringInterval: expanded?.recurring?.interval ?? null,
        recurringIntervalCount: expanded?.recurring?.interval_count ?? null,
        declaredProductType: announcedKind || null,
        productTypeReviewRequired: kind === "unclassified",
        assetImageUrls: images,
        assetRightsVerified: explicitlyVerifiedRights,
        mediaUsageApprovalRequired: !explicitlyVerifiedRights,
        importedAt,
        reviewRequired: true,
      },
    },
  };
}
/** Stable and complete offset-free pagination, with strict anti-loop and cap. */
export async function readStripeCatalogue(
  listPage: (cursor?: string) => Promise<{
    data: StripeProductInput[];
    has_more: boolean;
  }>,
  maxPages = 5,
): Promise<{ products: StripeProductInput[]; complete: boolean; pages: number }> {
  const bound = Math.max(1, Math.min(20, Math.floor(maxPages)));
  const seenProducts = new Set<string>(), seenCursors = new Set<string>();
  const products: StripeProductInput[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < bound; page++) {
    if (cursor && seenCursors.has(cursor)) throw new Error("Stripe-Pagination wiederholt denselben Cursor.");
    if (cursor) seenCursors.add(cursor);
    const result = await listPage(cursor);
    if (!Array.isArray(result.data)) throw new Error("Stripe gab keine Produktliste zurueck.");
    for (const product of result.data) {
      if (seenProducts.has(product.id)) continue;
      seenProducts.add(product.id);
      products.push(product);
    }
    if (!result.has_more) return { products, complete: true, pages: page + 1 };
    const lastId = result.data.at(-1)?.id;
    if (!lastId || lastId === cursor) throw new Error("Stripe-Pagination hat keinen neuen End-Cursor.");
    cursor = lastId;
  }
  return { products, complete: false, pages: bound };
}

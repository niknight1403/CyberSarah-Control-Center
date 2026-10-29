/**
 * Stripe price catalogue: read-only product variant aggregation.
 * Prices are facts from Stripe, NOT permissions to update billing.
 * The result is a draft-only snapshot; recurring and tax fields are explicit.
 */
export type StripePriceInput = {
  id: string;
  product: string | { id: string };
  active: boolean;
  currency: string;
  unit_amount: number | null;
  tax_behavior?: string | null;
  type?: string;
  recurring?: { interval: string; interval_count: number } | null;
  nickname?: string | null;
};
export type PriceVariant = {
  priceId: string;
  currency: string;
  unitAmount: number | null;
  taxBehavior: string;
  recurring: boolean;
  interval: string | null;
  intervalCount: number | null;
  nickname: string | null;
};
export type PriceCatalogue = { prices: StripePriceInput[]; complete: boolean; pages: number };
const productId = (value: StripePriceInput["product"]): string =>
  typeof value === "string" ? value : value.id;
export async function readStripePrices(
  page: (cursor?: string) => Promise<{ data: StripePriceInput[]; has_more: boolean }>,
  maxPages = 20,
): Promise<PriceCatalogue> {
  const limit = Math.max(1, Math.min(20, Math.floor(maxPages)));
  const seenPages = new Set<string>(), seenIds = new Set<string>();
  const prices: StripePriceInput[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < limit; i++) {
    if (cursor && seenPages.has(cursor)) throw new Error("Stripe-Preispagination wiederholt den Cursor.");
    if (cursor) seenPages.add(cursor);
    const batch = await page(cursor);
    if (!Array.isArray(batch.data)) throw new Error("Stripe-Preispagination liefert keine Liste.");
    for (const entry of batch.data) {
      if (seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      prices.push(entry);
    }
    if (!batch.has_more) return { prices, complete: true, pages: i + 1 };
    const next = batch.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Preispagination ohne Fortschritt.");
    cursor = next;
  }
  return { prices, complete: false, pages: limit };
}
export function groupStripePriceVariants(prices: StripePriceInput[]): Map<string, PriceVariant[]> {
  const variants = new Map<string, PriceVariant[]>();
  for (const price of prices) {
    if (!price.active || !/^price_[A-Za-z0-9_]+$/.test(price.id)) continue;
    const product = productId(price.product);
    if (!/^prod_[A-Za-z0-9]+$/.test(product)) continue;
    const amount = price.unit_amount;
    const validAmount = amount !== null && Number.isSafeInteger(amount) && amount >= 0;
    const variant: PriceVariant = {
      priceId: price.id,
      currency: price.currency.toLowerCase(),
      unitAmount: validAmount ? amount : null,
      taxBehavior: price.tax_behavior ?? "unspecified",
      recurring: Boolean(price.recurring),
      interval: price.recurring?.interval ?? null,
      intervalCount: price.recurring?.interval_count ?? null,
      nickname: price.nickname?.slice(0, 150) ?? null,
    };
    const group = variants.get(product) ?? [];
    group.push(variant);
    variants.set(product, group);
  }
  for (const group of variants.values()) group.sort((a, b) =>
    a.currency.localeCompare(b.currency) ||
    String(a.interval).localeCompare(String(b.interval)) ||
    (a.unitAmount ?? -1) - (b.unitAmount ?? -1) ||
    a.priceId.localeCompare(b.priceId));
  return variants;
}
export function priceVariantsReview(variants: PriceVariant[], complete: boolean) {
  return {
    variants: variants.slice(0, 100),
    variantsTruncated: variants.length > 100,
    priceInventoryComplete: complete,
    priceVariantCount: variants.length,
    currencyReviewRequired: variants.some(v => v.currency !== "eur"),
    recurringVariantsPresent: variants.some(v => v.recurring),
    taxReviewRequired: variants.some(v => v.taxBehavior === "unspecified"),
  };
}

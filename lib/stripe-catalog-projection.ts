/**
 * Read-only Stripe product inventory projection. No credentials, raw metadata,
 * billing identities, file URLs, or write permissions appear in this output.
 */
export type StripeCatalogProduct = {
  id: string;
  name: string;
  active: boolean;
  defaultPriceId: string | null;
  priceCount: number;
  issues: string[];
  rightsVerified: false;
  affiliateDisclosureVerified: false;
};
export type StripeCatalogPrice = {
  id: string;
  productId: string;
  active: boolean;
  currency: string;
  amountMinor: number | null;
  billing: "one_time" | "recurring";
  interval: string | null;
  intervalCount: number | null;
  taxBehavior: "exclusive" | "inclusive" | "unspecified";
  issues: string[];
};
export type StripeCatalogPage = {
  products: StripeCatalogProduct[];
  prices: StripeCatalogPrice[];
  problems: string[];
  productCount: number;
  priceCount: number;
  complete: boolean;
  skippedDuplicateProducts: number;
  skippedDuplicatePrices: number;
};
type RawProduct = {
  id: string; name?: string; active?: boolean; default_price?: string | {id:string} | null;
  metadata?: Record<string,string>;
};
type RawPrice = {
  id: string; product: string | {id:string}; active?: boolean; currency?: string;
  unit_amount?: number | null; type?: string;
  recurring?: {interval?:string;interval_count?:number} | null;
  tax_behavior?: string | null; metadata?: Record<string,string>;
};
export function projectStripeCatalog(
  rawProducts: readonly RawProduct[],
  rawPrices: readonly RawPrice[],
  productsComplete: boolean,
  pricesComplete: boolean,
): StripeCatalogPage {
  const products = new Map<string, StripeCatalogProduct>();
  const prices = new Map<string, StripeCatalogPrice>();
  const problems: string[] = [];
  let skippedDuplicateProducts = 0, skippedDuplicatePrices = 0;
  for (const product of rawProducts) {
    if (!product.id || products.has(product.id)) {
      skippedDuplicateProducts++;
      continue;
    }
    const id = typeof product.default_price === "string" ? product.default_price
      : product.default_price?.id ?? null;
    products.set(product.id, {
      id: product.id, name: String(product.name || "Ohne Namen").slice(0,180),
      active: product.active === true, defaultPriceId: id, priceCount: 0, issues: [],
      // Stripe metadata is a claim, not proof of asset/affiliate rights.
      rightsVerified: false, affiliateDisclosureVerified: false,
    });
  }
  for (const price of rawPrices) {
    if (!price.id || prices.has(price.id)) {
      skippedDuplicatePrices++;
      continue;
    }
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const interval = price.recurring?.interval ?? null;
    const type = price.type === "recurring" ? "recurring" : "one_time";
    const taxBehavior = price.tax_behavior === "exclusive" || price.tax_behavior === "inclusive"
      ? price.tax_behavior : "unspecified";
    const issues: string[] = [];
    const amountMinor = typeof price.unit_amount === "number" &&
      Number.isSafeInteger(price.unit_amount) && price.unit_amount >= 0
      ? price.unit_amount : null;
    if (amountMinor === null) issues.push("Betrag nicht eindeutig");
    if (!/^[a-z]{3}$/.test(price.currency ?? "")) issues.push("Waehrung ungueltig");
    if (type === "recurring" && (!interval || !Number.isSafeInteger(price.recurring?.interval_count)
      || (price.recurring?.interval_count ?? 0) < 1)) issues.push("Abo-Intervall unvollstaendig");
    if (taxBehavior === "unspecified") issues.push("Steuerbehandlung pruefen");
    const parent = products.get(productId);
    if (!parent) issues.push("Produktverweis fehlt oder Katalog unvollstaendig");
    if (parent) parent.priceCount++;
    prices.set(price.id, {
      id: price.id, productId, active: price.active === true,
      currency: price.currency || "unknown", amountMinor, billing: type,
      interval: type === "recurring" ? interval : null,
      intervalCount: type === "recurring" ? price.recurring?.interval_count ?? null : null,
      taxBehavior, issues,
    });
  }
  for (const product of products.values()) {
    if (!product.active) product.issues.push("Stripe-Produkt inaktiv");
    if (!product.defaultPriceId) product.issues.push("Kein Standardpreis");
    else if (!prices.has(product.defaultPriceId)) product.issues.push("Standardpreis nicht im erfassten Preiskatalog");
    else if (!prices.get(product.defaultPriceId)?.active) product.issues.push("Standardpreis inaktiv");
  }
  if (!productsComplete) problems.push("Produkt-Pagination unvollstaendig; kein vollstaendiger Katalog");
  if (!pricesComplete) problems.push("Preis-Pagination unvollstaendig; Preisvarianten nicht abschliessend");
  if (skippedDuplicateProducts || skippedDuplicatePrices)
    problems.push("Doppelte Stripe-IDs in Quelle erkannt und nicht erneut uebernommen");
  return {
    products: [...products.values()], prices: [...prices.values()], problems,
    productCount: products.size, priceCount: prices.size,
    complete: productsComplete && pricesComplete,
    skippedDuplicateProducts, skippedDuplicatePrices,
  };
}

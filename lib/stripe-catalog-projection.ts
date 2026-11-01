/**
 * Read-only Stripe product inventory projection. No credentials, raw metadata,
 * billing identities, file URLs, or write permissions appear in this output.
 */
import { compareProductVariants } from "./stripe-variant-validity-logic";
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
  /** Erstellzeitpunkt als ISO-Zeitstempel; `null`, wenn die Quelle keinen liefert. */
  createdAt: string | null;
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
  created?: number;
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
    const createdAt =
      typeof price.created === "number" && Number.isFinite(price.created) && price.created > 0
        ? new Date(price.created * 1000).toISOString()
        : null;
    prices.set(price.id, {
      id: price.id, createdAt, productId, active: price.active === true,
      currency: price.currency || "unknown", amountMinor, billing: type,
      interval: type === "recurring" ? interval : null,
      intervalCount: type === "recurring" ? price.recurring?.interval_count ?? null : null,
      taxBehavior, issues,
    });
  }
  const nameCounts = new Map<string, number>();
  for (const item of products.values()) {
    const normalized = item.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
    nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
  }
  for (const product of products.values()) {
    const normalizedName = product.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
    if ((nameCounts.get(normalizedName) ?? 0) > 1) {
      product.issues.push("Produktname mehrfach vorhanden: Varianten und IDs pruefen");
    }
    if (/\b(?:nur heute|nur noch heute|letzte chance|limited time)\b/i.test(product.name)
        || /\b-?\d{1,2}\s*%/.test(product.name)) {
      product.issues.push("Zeit- oder Rabattversprechen vor Verwendung belegen");
    }
    const assigned = [...prices.values()].filter(price => price.productId === product.id && price.active);
    if (/(?:membership|mitgliedschaft|abo(?:nnement)?|subscription)/i.test(product.name) &&
        assigned.length > 0 && assigned.every(price => price.billing === "one_time")) {
      product.issues.push(pricesComplete
        ? "Mitgliedschaft ohne wiederkehrenden Stripe-Preis"
        : "Wiederkehrender Mitgliedschaftspreis im Teilkatalog nicht nachgewiesen");
    }
    if (assigned.some(price => price.taxBehavior === "unspecified")) {
      product.issues.push("Steuerbehandlung mindestens einer Preisvariante pruefen");
    }
    // Sprint 22 - steuerliche/zeitliche Gueltigkeit der Varianten vergleichen.
    const comparison = compareProductVariants(
      [...prices.values()]
        .filter(price => price.productId === product.id)
        .map(price => ({
          id: price.id,
          currency: price.currency,
          amountMinor: price.amountMinor,
          billing: price.billing,
          interval: price.interval,
          intervalCount: price.intervalCount,
          taxBehavior: price.taxBehavior,
          active: price.active,
          createdAtMs: price.createdAt === null ? null : Date.parse(price.createdAt),
          isDefault: price.id === product.defaultPriceId,
        })),
    );
    for (const issue of comparison.issues) {
      if (!product.issues.includes(issue)) product.issues.push(issue);
    }
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

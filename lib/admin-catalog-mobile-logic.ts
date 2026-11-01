/**
 * Sprint 30 - Admin-Produktkatalog mobil filtern, pruefen und manuell freigeben.
 *
 * Reine Logik, keine Seiteneffekte und keine Stripe-Schreibzugriffe.
 *
 * Grundsaetze:
 * - Ein Produkt ist nur freigabefaehig, wenn der Katalog vollstaendig gelesen
 *   wurde und keine blockierenden Befunde vorliegen. Ein Teilkatalog darf nie
 *   zu einer Freigabe fuehren.
 * - Warnungen blockieren nicht, werden aber immer mitgegeben.
 * - Die Freigabe ist eine menschliche Entscheidung; diese Logik liefert nur die
 *   Begruendung, ob sie fachlich zulaessig ist.
 */

export type CatalogVerdict = "freigabefaehig" | "pruefen" | "blockiert";

export interface ReviewPriceInput {
  id: string;
  currency: string;
  amountMinor: number | null;
  billing: "one_time" | "recurring";
  interval: string | null;
  intervalCount: number | null;
  taxBehavior: "exclusive" | "inclusive" | "unspecified";
  active: boolean;
  createdAtMs: number | null;
  isDefault: boolean;
}

export interface ReviewProductInput {
  id: string;
  name: string;
  active: boolean;
  defaultPriceId: string | null;
  priceCount: number;
  issues: readonly string[];
}

export interface ProductReview {
  productId: string;
  verdict: CatalogVerdict;
  eligible: boolean;
  blockers: string[];
  warnings: string[];
}

/** Befunde, die eine Freigabe fachlich ausschliessen. */
const BLOCKING_PATTERNS: readonly RegExp[] = [
  /Produktverweis fehlt/i,
  /kein Standardpreis/i,
  /Standardpreis nicht im erfassten/i,
  /Standardpreis inaktiv/i,
  /Betrag nicht eindeutig/i,
  /Waehrung ungueltig/i,
  /Keine aktive Preisvariante/i,
  /Mehrere aktive Preise/i,
  /weiterhin aktiv und damit verkaufbar/i,
  /Stripe-Produkt inaktiv/i,
  /Mitgliedschaft ohne wiederkehrenden Stripe-Preis/i,
];

/** Befunde, die eine Freigabe nur mit menschlicher Pruefung zulassen. */
const WARNING_PATTERNS: readonly RegExp[] = [
  /Steuerbehandlung/i,
  /Produktname mehrfach/i,
  /Rabattversprechen/i,
  /Zeit- oder Rabattversprechen/i,
  /Erstellzeitpunkt fehlt/i,
  /steuerlich unterschiedlich behandelt/i,
  /nicht nachgewiesen/i,
];

export function reviewCatalogProduct(
  product: ReviewProductInput,
  prices: readonly ReviewPriceInput[],
  options: { catalogComplete: boolean },
): ProductReview {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!options.catalogComplete) {
    blockers.push("Katalog unvollstaendig gelesen: keine Freigabe auf Teilbestand");
  }
  if (!product.active) blockers.push("Produkt ist bei Stripe inaktiv");
  if (!product.defaultPriceId) blockers.push("Kein Standardpreis hinterlegt");

  const ownPrices = prices.filter(price => price.isDefault || product.defaultPriceId !== null);
  const defaultPrice = product.defaultPriceId
    ? ownPrices.find(price => price.id === product.defaultPriceId)
    : undefined;
  if (product.defaultPriceId && !defaultPrice) {
    blockers.push("Standardpreis nicht im erfassten Preiskatalog");
  } else if (defaultPrice && !defaultPrice.active) {
    blockers.push("Standardpreis ist inaktiv");
  }

  for (const issue of product.issues) {
    if (BLOCKING_PATTERNS.some(pattern => pattern.test(issue))) {
      if (!blockers.includes(issue)) blockers.push(issue);
      continue;
    }
    if (WARNING_PATTERNS.some(pattern => pattern.test(issue))) {
      if (!warnings.includes(issue)) warnings.push(issue);
      continue;
    }
    if (!warnings.includes(issue)) warnings.push(issue);
  }

  const verdict: CatalogVerdict = blockers.length > 0 ? "blockiert" : warnings.length > 0 ? "pruefen" : "freigabefaehig";
  return { productId: product.id, verdict, eligible: blockers.length === 0, blockers, warnings };
}

export interface CatalogFilter {
  search?: string;
  activeOnly?: boolean;
  onlyWithIssues?: boolean;
  verdict?: CatalogVerdict;
  currency?: string;
  maxPriceMinor?: number;
  limit?: number;
}

export interface CatalogRow {
  id: string;
  name: string;
  active: boolean;
  priceCount: number;
  defaultPrice: { currency: string; amountMinor: number | null; billing: "one_time" | "recurring" } | null;
  verdict: CatalogVerdict;
  issueCount: number;
  blockers: string[];
  warnings: string[];
}

export interface CatalogFacets {
  total: number;
  active: number;
  inactive: number;
  withIssues: number;
  freigabefaehig: number;
  pruefen: number;
  blockiert: number;
  currencies: string[];
}

export interface CatalogFilterResult {
  rows: CatalogRow[];
  matched: number;
  truncated: boolean;
  facets: CatalogFacets;
  note: string | null;
}

/** Normalisiert Suchtext: Kleinschreibung, Umlaute, mehrfache Leerzeichen. */
export function normalizeCatalogSearch(value: string): string {
  return value
    .toLocaleLowerCase("de")
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(row: CatalogRow, needle: string): boolean {
  if (!needle) return true;
  const haystack = normalizeCatalogSearch(`${row.name} ${row.id}`);
  return needle.split(" ").filter(Boolean).every(part => haystack.includes(part));
}

const VERDICT_ORDER: Record<CatalogVerdict, number> = { blockiert: 0, pruefen: 1, freigabefaehig: 2 };

export function filterCatalogProducts(
  products: readonly ReviewProductInput[],
  prices: readonly ReviewPriceInput[],
  filter: CatalogFilter,
  options: { catalogComplete: boolean },
): CatalogFilterResult {
  const search = normalizeCatalogSearch(filter.search ?? "");
  const reviews = new Map(
    products.map(product => [product.id, reviewCatalogProduct(product, prices, options)] as const),
  );

  const allRows: CatalogRow[] = products.map(product => {
    const review = reviews.get(product.id)!;
    const defaultPrice = product.defaultPriceId
      ? prices.find(price => price.id === product.defaultPriceId) ?? null
      : null;
    return {
      id: product.id,
      name: product.name,
      active: product.active,
      priceCount: product.priceCount,
      defaultPrice: defaultPrice
        ? { currency: defaultPrice.currency, amountMinor: defaultPrice.amountMinor, billing: defaultPrice.billing }
        : null,
      verdict: review.verdict,
      issueCount: product.issues.length,
      blockers: review.blockers,
      warnings: review.warnings,
    };
  });

  const currencies = [...new Set(prices.filter(price => price.active).map(price => price.currency))].sort();
  const facets: CatalogFacets = {
    total: allRows.length,
    active: allRows.filter(row => row.active).length,
    inactive: allRows.filter(row => !row.active).length,
    withIssues: allRows.filter(row => row.issueCount > 0).length,
    freigabefaehig: allRows.filter(row => row.verdict === "freigabefaehig").length,
    pruefen: allRows.filter(row => row.verdict === "pruefen").length,
    blockiert: allRows.filter(row => row.verdict === "blockiert").length,
    currencies,
  };

  const filtered = allRows.filter(row => {
    if (filter.activeOnly && !row.active) return false;
    if (filter.onlyWithIssues && row.issueCount === 0) return false;
    if (filter.verdict && row.verdict !== filter.verdict) return false;
    if (filter.currency && row.defaultPrice?.currency !== filter.currency) return false;
    if (typeof filter.maxPriceMinor === "number") {
      if (row.defaultPrice === null || row.defaultPrice.amountMinor === null) return false;
      if (row.defaultPrice.amountMinor > filter.maxPriceMinor) return false;
    }
    return matchesSearch(row, search);
  });

  const exact = (row: CatalogRow) =>
    search && (normalizeCatalogSearch(row.name) === search || row.id === filter.search?.trim()) ? 0 : 1;
  filtered.sort(
    (a, b) =>
      exact(a) - exact(b) ||
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      b.issueCount - a.issueCount ||
      a.name.localeCompare(b.name, "de"),
  );

  const limit = filter.limit ?? 25;
  const rows = filtered.slice(0, limit);
  const note = filtered.length === 0
    ? "Keine Produkte entsprechen den Filtern."
    : !options.catalogComplete
      ? "Katalog unvollstaendig gelesen: Treffer sind nicht abschliessend, keine Freigabe moeglich."
      : null;

  return { rows, matched: filtered.length, truncated: filtered.length > rows.length, facets, note };
}

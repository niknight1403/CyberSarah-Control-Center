import type { StripeCatalogPage, StripeCatalogProduct } from "./stripe-catalog-projection";

/** Sprint 22: do not present conflicting Stripe variant prices as one known offer. */
export function reviewProductPriceVariants(catalog: StripeCatalogPage, productId: string): string[] {
  const prices = catalog.prices.filter(price => price.productId === productId && price.active);
  const flags: string[] = [];
  if (new Set(prices.map(price => price.currency)).size > 1)
    flags.push("Aktive Preisvarianten haben unterschiedliche Währungen – CTA nur mit eindeutiger Währung freigeben");
  if (new Set(prices.map(price => price.taxBehavior)).size > 1)
    flags.push("Preisvarianten haben unterschiedliche Steuerbehandlungen – je Angebot steuerlich prüfen");
  if (new Set(prices.map(price => price.billing)).size > 1)
    flags.push("Einmalzahlung und Abonnement nicht als denselben Preis bewerben");
  if (prices.some(price => price.billing === "recurring" &&
      (!price.interval || !Number.isSafeInteger(price.intervalCount) || (price.intervalCount ?? 0) < 1)))
    flags.push("Abo-Intervall mindestens einer aktiven Variante nicht überprüfbar");
  if (prices.length > 0)
    flags.push("Zeitliche Gültigkeit und regionale Verfügbarkeit von Stripe-Preisen separat belegen");
  return flags;
}

/** Sprint 27: provider metadata is never proof of commercial usage rights. */
export function reviewProductRights(product: StripeCatalogProduct): string[] {
  const checks = [];
  if (product.rightsVerified !== true)
    checks.push("Rechtefreigabe offen: Lizenzinhaber, Medienquelle und Nutzungsumfang dokumentieren");
  if (product.affiliateDisclosureVerified !== true)
    checks.push("Affiliate-/Werbekennzeichnung offen: Vergütungsmodell und Plattformhinweis prüfen");
  return checks;
}

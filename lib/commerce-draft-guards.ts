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
  if (!product.rightsVerified)
    checks.push("Rechtefreigabe offen: Lizenzinhaber, Medienquelle und Nutzungsumfang dokumentieren");
  if (!product.affiliateDisclosureVerified)
    checks.push("Affiliate-/Werbekennzeichnung offen: Vergütungsmodell und Plattformhinweis prüfen");
  return checks;
}

/** Sprint 28: require Stripe-shaped provenance IDs, not user-controlled text. */
export function validateStripeSourceIds(productId: string, priceId: string): string | null {
  if (!/^prod_[A-Za-z0-9_]{2,120}$/.test(productId) ||
      !/^price_[A-Za-z0-9_]{2,120}$/.test(priceId))
    return "Stripe-Quell-IDs nicht eindeutig gültig; Entwurf nicht speichern";
  return null;
}

/** Sprint 33: three editorially distinct, conservative hook experiments. */
export function buildSafeProductHooks(productName: string): string[] {
  const title=productName.replace(/\s+/g," ").trim();
  return [
    `Neugierig auf ${title}? Diese Angaben solltest du zuerst prüfen.`,
    `Drei Fakten-Checks vor deiner Entscheidung zu ${title}.`,
    `Welche Fragen sind bei ${title} noch offen? Ein kurzer Überblick.`,
  ];
}

/** Sprint 34: text-only evidence checklist; it cannot authorize a real render. */
export function buildMediaRightsChecklist(product: StripeCatalogProduct): string {
  return [
    "RENDER-STATUS: BLOCKIERT – keine verwendungsberechtigten Medien-Dateien nachgewiesen.",
    `Stripe-Produkt: ${product.id}`,
    "Quelle/Urheber und Lizenztyp je Bild/Audio/Video belegen.",
    "Nutzungsgebiet, Plattformen, Laufzeit, Bearbeitungs- und Werberechte prüfen.",
    "KI-Avatar- und Markenfreigaben separat dokumentieren.",
    "Rechte-Checkliste ist keine Lizenz und keine automatische Freigabe.",
  ].join("\n");
}

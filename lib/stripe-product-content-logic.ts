/**
 * Administrator-controlled, read-only Stripe product -> editable content plan.
 * Nothing is published, charged, price-adjusted or rendered by this bridge.
 */
import type { StripeCatalogPage } from "./stripe-catalog-projection";
import { reviewProductPriceVariants, reviewProductRights, validateStripeSourceIds, buildSafeProductHooks } from "./commerce-draft-guards";
import { buildReviewableProductReel } from "./reel-storyboard-logic";
import {
  validateDraftPayload, type ContentDraftPayload,
} from "./draft-engine-logic";
export const PRODUCT_CONTENT_REVIEW = [
  "Leistungsumfang und Produkteigenschaften mit der Originalquelle abgleichen",
  "Medien-/Markenrechte und etwaige Affiliate-Kennzeichnung vor Publikation prüfen",
  "Checkout-Link, Währung, Steuerangaben und Verfügbarkeit vor einem CTA prüfen",
] as const;
export type ProductContentBrief =
  | { ok: true; payload: ContentDraftPayload; title: string; stripeProductId: string; stripePriceId: string }
  | { ok: false; reason: string };
export function buildProductContentBrief(
  catalog: StripeCatalogPage,
  productId: string,
  personaId = "nova",
  platform = "instagram",
): ProductContentBrief {
  const product = catalog.products.find(item => item.id === productId);
  if (!catalog.complete) return { ok: false, reason: "Stripe-Katalog unvollständig – Produktzuordnung nicht nachweisbar." };
  if (catalog.skippedDuplicateProducts > 0 || catalog.skippedDuplicatePrices > 0)
    return { ok: false, reason: "Doppelte Stripe-Quell-IDs erkannt – Content-Freigabe bis Katalogabgleich blockiert." };
  if (!product || !product.active) return { ok: false, reason: "Produkt nicht verfügbar oder inaktiv." };
  const price = catalog.prices.find(item =>
    item.id === product.defaultPriceId && item.productId === product.id && item.active);
  if (!price || price.amountMinor === null || !/^[a-z]{3}$/.test(price.currency)) {
    return { ok: false, reason: "Kein überprüfbarer aktiver Standardpreis vorhanden." };
  }
  const sourceError = validateStripeSourceIds(product.id, price.id);
  if (sourceError) return { ok: false, reason: sourceError };
  const name = product.name.trim();
  if (!name || name === "Ohne Namen") return { ok: false, reason: "Produktname ist nicht belastbar." };
  if (!/^[a-z0-9_-]{2,40}$/i.test(personaId) || !["instagram","tiktok","linkedin","x","threads","bluesky"].includes(platform)) {
    return { ok: false, reason: "Persona oder Plattform nicht unterstützt." };
  }
  const storyboard = buildReviewableProductReel(name);
  if (!storyboard.ok) return { ok: false, reason: storyboard.reason };
  const hookVariants = buildSafeProductHooks(name);
  const content = [
    "Produkt im Überblick: " + name + ".",
    "Worum geht es bei diesem Angebot? Welche Informationen sind für Interessierte wichtig?",
    "Details zu Leistungen, Konditionen und Verfügbarkeit müssen vor der Veröffentlichung bestätigt werden.",
    "Mehr erfahren nach redaktioneller und rechtlicher Prüfung.",
  ].join("\n");
  const candidate = validateDraftPayload("content", {
    personaId, platform, topic: "Produktvorstellung: " + name, content,
    assets: [
      {format:"reel-storyboard",variant:1,title:"Reel-Konzept (Timing, Sprechertext, Untertitel)",content:storyboard.content},
      {format:"landing-outline",variant:1,title:"Landingpage-Konzept",content:
        "Headline: Produktname.\nAbschnitte: Zielgruppe, nachweisbare Produktdetails, Bedingungen, Datenschutzhinweise und erst nach Prüfung Checkout-CTA."},
      {format:"story-outline",variant:1,title:"Story-Konzept",content:
        "Frame 1: Produktname. Frame 2: häufige Interessentenfrage. Frame 3: sachliche Antwort nach Quellenprüfung. Frame 4: überprüfter CTA."},
      ...hookVariants.map((hook, index)=>({format:"hook-variant",variant:index+1,title:`Hook-Version ${index+1}`,content:hook})),
    ],
  });
  if (!candidate.valid) return { ok: false, reason: candidate.reason };
  const payload = candidate.payload as ContentDraftPayload;
  return {
    ok: true, stripeProductId: product.id, stripePriceId: price.id,
    title: candidate.title, payload: {
      ...payload,
      // Domain-specific review flags are required even without a keyword hit.
      reviewFlags: [...new Set([...(payload.reviewFlags ?? []), ...PRODUCT_CONTENT_REVIEW,
        ...product.issues, ...price.issues, ...reviewProductPriceVariants(catalog, product.id), ...reviewProductRights(product)])],
      commerceSource: { provider: "stripe", productId: product.id, priceId: price.id },
    },
  };
}

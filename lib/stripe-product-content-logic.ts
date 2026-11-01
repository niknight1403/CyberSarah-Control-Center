/**
 * Administrator-controlled, read-only Stripe product -> editable content plan.
 * Nothing is published, charged, price-adjusted or rendered by this bridge.
 */
import type { StripeCatalogPage } from "./stripe-catalog-projection";
import { reviewProductPriceVariants, reviewProductRights, validateStripeSourceIds, buildSafeProductHooks, buildMediaRightsChecklist, resolveCampaignPersona, mobileCreativeSpec, buildLandingCtaContract, buildPrivacyReviewGate } from "./commerce-draft-guards";
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
  const persona = resolveCampaignPersona(personaId);
  if (!persona) return { ok: false, reason: "KI-Persona ist nicht in der offiziellen Persona-Bibliothek vorhanden." };
  const mobileSpec = mobileCreativeSpec(platform);
  if (!mobileSpec) return { ok: false, reason: "Mobile-Format für Plattform unbekannt." };
  const storyboard = buildReviewableProductReel(name);
  if (!storyboard.ok) return { ok: false, reason: storyboard.reason };
  const hookVariants = buildSafeProductHooks(name);
  const cta = buildLandingCtaContract(product.id, price.id);
  const privacyGate = buildPrivacyReviewGate();
  const content = [
    "Produkt im Überblick: " + name + ".",
    "Worum geht es bei diesem Angebot? Welche Informationen sind für Interessierte wichtig?",
    "Details zu Leistungen, Konditionen und Verfügbarkeit müssen vor der Veröffentlichung bestätigt werden.",
    "Mehr erfahren nach redaktioneller und rechtlicher Prüfung.",
  ].join("\n");
  const candidate = validateDraftPayload("content", {
    personaId, platform, topic: "Produktvorstellung: " + name, content, disclosure: persona.disclosure,
    assets: [
      {format:"reel-storyboard",variant:1,title:"Reel-Konzept (Timing, Sprechertext, Untertitel)",content:storyboard.content},
      {format:"landing-outline",variant:1,title:"Landingpage-Konzept",content:
        "Headline: Produktname.\nAbschnitte: Zielgruppe, nachweisbare Produktdetails, Bedingungen, Datenschutzhinweise und erst nach Prüfung Checkout-CTA."},
      {format:"landing-cta-contract",variant:1,title:"CTA-Vertrag (Freigabe ausstehend)",content:JSON.stringify(cta)},
      {format:"landing-privacy-gate",variant:1,title:"Consent und Tracking standardmäßig deaktiviert",content:JSON.stringify(privacyGate)},
      {format:"story-outline",variant:1,title:"Story-Konzept",content:
        "Frame 1: Produktname. Frame 2: häufige Interessentenfrage. Frame 3: sachliche Antwort nach Quellenprüfung. Frame 4: überprüfter CTA."},
      ...hookVariants.map((hook, index)=>({format:"hook-variant",variant:index+1,title:`Hook-Version ${index+1}`,content:hook})),
      {format:"media-rights-checklist",variant:1,title:"Render- und Lizenz-Freigabe (ausstehend)",content:buildMediaRightsChecklist(product)},
      {format:"mobile-creative-spec",variant:1,title:"Mobile-Format und Safe-Area",
        content:`Canvas: ${mobileSpec.width}x${mobileSpec.height}. ${mobileSpec.safeArea}. ${mobileSpec.notes}. Kein gerendertes Asset.`},
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

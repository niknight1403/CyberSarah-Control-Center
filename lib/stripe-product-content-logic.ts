/**
 * Administrator-controlled, read-only Stripe product -> editable content plan.
 * Nothing is published, charged, price-adjusted or rendered by this bridge.
 */
import type { StripeCatalogPage } from "./stripe-catalog-projection";
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
  if (!product || !product.active) return { ok: false, reason: "Produkt nicht verfügbar oder inaktiv." };
  const price = catalog.prices.find(item =>
    item.id === product.defaultPriceId && item.productId === product.id && item.active);
  if (!price || price.amountMinor === null || !/^[a-z]{3}$/.test(price.currency)) {
    return { ok: false, reason: "Kein überprüfbarer aktiver Standardpreis vorhanden." };
  }
  const name = product.name.trim();
  if (!name || name === "Ohne Namen") return { ok: false, reason: "Produktname ist nicht belastbar." };
  if (!/^[a-z0-9_-]{2,40}$/i.test(personaId) || !["instagram","tiktok","linkedin","x","threads","bluesky"].includes(platform)) {
    return { ok: false, reason: "Persona oder Plattform nicht unterstützt." };
  }
  const content = [
    "Produkt im Überblick: " + name + ".",
    "Worum geht es bei diesem Angebot? Welche Informationen sind für Interessierte wichtig?",
    "Details zu Leistungen, Konditionen und Verfügbarkeit müssen vor der Veröffentlichung bestätigt werden.",
    "Mehr erfahren nach redaktioneller und rechtlicher Prüfung.",
  ].join("\n");
  const candidate = validateDraftPayload("content", {
    personaId, platform, topic: "Produktvorstellung: " + name, content,
    assets: [
      {format:"reel-storyboard",variant:1,title:"Reel-Konzept",content:
        "0–3 s: Produktname und neutrale Frage als Hook.\n3–12 s: Prüffragen zu Nutzen und Zielgruppe.\n12–22 s: Nachweisbare Details ergänzen.\n22–27 s: CTA erst nach Checkout- und Rechteprüfung."},
      {format:"landing-outline",variant:1,title:"Landingpage-Konzept",content:
        "Headline: Produktname.\nAbschnitte: Zielgruppe, nachweisbare Produktdetails, Bedingungen, Datenschutzhinweise und erst nach Prüfung Checkout-CTA."},
      {format:"story-outline",variant:1,title:"Story-Konzept",content:
        "Frame 1: Produktname. Frame 2: häufige Interessentenfrage. Frame 3: sachliche Antwort nach Quellenprüfung. Frame 4: überprüfter CTA."},
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
        ...product.issues, ...price.issues])],
    },
  };
}

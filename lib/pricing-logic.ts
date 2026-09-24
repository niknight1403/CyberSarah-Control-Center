/**
 * Sprint 265 — Preisdarstellung (rein, testbar): ehrliche Landing-Pricing.
 *
 * Ehrlichkeits-Regeln:
 *   - Preise stehen als Konfiguration im ENV (cents), nie hart im UI-Code —
 *     und wenn kein Preis konfiguriert ist, steht "auf Anfrage", nicht "0 €".
 *   - Jeder Tarif nennt, was er freischaltet, UND was er nicht freischaltet.
 *   - Kein "beliebt"-Badge ohne Grund: Pro ist die Empfehlung, weil Agent +
 *     Preview dort beginnen — das ist der ehrliche Hebel.
 */

import { TIER_ENTITLEMENTS, TIER_LABELS, type SubscriptionTier, tierPriceId } from "./subscription-tiers-logic";

export type PriceInfo = { amountCents: number | null; currency: "eur" };

export const TIER_PRICE_ENV_CENTS: Record<SubscriptionTier, string> = {
  lite: "TIER_PRICE_CENTS_LITE",
  pro: "TIER_PRICE_CENTS_PRO",
  expert: "TIER_PRICE_CENTS_EXPERT",
};

export const RECOMMENDED_TIER: SubscriptionTier = "pro";

export function tierPriceCents(tier: SubscriptionTier, env: Record<string, string | undefined>): number | null {
  const raw = env[TIER_PRICE_ENV_CENTS[tier]]?.trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatPrice(amountCents: number | null): string {
  if (amountCents === null) return "Preis auf Anfrage";
  return `${(amountCents / 100).toFixed(2).replace(".", ",")} € / Monat`;
}

export type TierPresentation = {
  tier: SubscriptionTier;
  label: string;
  price: PriceInfo;
  priceLabel: string;
  recommended: boolean;
  entitlements: readonly string[];
  limitations: readonly string[];
};

const TIER_LIMITATIONS: Record<SubscriptionTier, readonly string[]> = {
  lite: ["Kein Agent-Modus", "Keine Vorschau", "Tageslimit im Chat"],
  pro: ["Keine Externe-Provider-Verwaltung", "Bild-/Medien-Quoten gelten"],
  expert: ["Fair-Use-Grenzen bleiben (Schutz vor Fehlprogrammierung)", "Keine Garantie von Umsätzen — ehrlich"],
};

export function buildTierPresentations(env: Record<string, string | undefined>): TierPresentation[] {
  const order: SubscriptionTier[] = ["lite", "pro", "expert"];
  return order.map((tier) => {
    const amountCents = tierPriceCents(tier, env);
    return {
      tier,
      label: TIER_LABELS[tier],
      price: { amountCents, currency: "eur" },
      priceLabel: formatPrice(amountCents),
      recommended: tier === RECOMMENDED_TIER,
      entitlements: TIER_ENTITLEMENTS[tier],
      limitations: TIER_LIMITATIONS[tier],
    };
  });
}

export function checkoutAvailability(tier: SubscriptionTier, env: Record<string, string | undefined>): { checkoutable: boolean; reason: string | null } {
  if (!tierPriceId(tier, env)) return { checkoutable: false, reason: `Für ${TIER_LABELS[tier]} ist keine Stripe-Preis-ID konfiguriert (ENV STRIPE_PRICE_ID_${tier.toUpperCase()}).` };
  return { checkoutable: true, reason: null };
}

/**
 * Sprint 318 — Tier-Vergleichs-Screen: reine, deterministische Logik
 * fuer den ehrlichen Vergleich Lite/Pro/Expert.
 *
 * Datenfluss:
 *   Tier-Katalog (Labels, Entitlements) plus optional bekannte
 *   Monatspreise ergeben die Vergleichsmatrix; Empfehlungen sind
 *   nur Bedarfssuchen, kein Verkaufstrick.
 *
 * Ehrlichkeits-Grenze: Preise erscheinen NUR wenn konfiguriert —
 *   sonst ehrlich "im Checkout". Nicht beworbene Limits werden
 *   nicht erfunden; nur Entitlements aus dem Katalog zaehlen.
 */

import {
  SUBSCRIPTION_TIERS,
  TIER_LABELS,
  TIER_ENTITLEMENTS,
  type SubscriptionTier,
  tierHasEntitlement,
} from "./subscription-tiers-logic";

export type TierPriceInfo = { cents: number; currency: string } | null;

/** Eine Zeile der Vergleichsmatrix: Feature x Tiere. */
export type ComparisonRow = {
  feature: string;
  perTier: Record<SubscriptionTier, boolean>;
};

/** Alle Entitlements quer ueber alle Tiere als Zeilen. */
export function buildComparisonRows(): ComparisonRow[] {
  const allFeatures = [...new Set(SUBSCRIPTION_TIERS.flatMap((t) => TIER_ENTITLEMENTS[t]))];
  return allFeatures.map((feature) => ({
    feature,
    perTier: Object.fromEntries(
      SUBSCRIPTION_TIERS.map((t) => [t, tierHasEntitlement(t, feature)]),
    ) as Record<SubscriptionTier, boolean>,
  }));
}

/** Preiszeile mit ehrlichem "im Checkout", wenn nicht konfiguriert. */
export function formatPriceCell(price: TierPriceInfo): string {
  if (price === null) return "Preis im Checkout";
  const value = (price.cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value} ${price.currency.toUpperCase()}/Monat`;
}

/** Spaltenkoepfe: Label + optional Preis. */
export function buildTierColumns(prices: Record<SubscriptionTier, TierPriceInfo>): Array<{
  tier: SubscriptionTier;
  label: string;
  priceText: string;
}> {
  return SUBSCRIPTION_TIERS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    priceText: formatPriceCell(prices[tier] ?? null),
  }));
}

/** Der niedrigste Tier, der alle benoetigten Features hat — oder null. */
export function minimalTierForNeeds(requiredFeatures: string[]): SubscriptionTier | null {
  return (
    SUBSCRIPTION_TIERS.find((tier) =>
      requiredFeatures.every((f) => tierHasEntitlement(tier, f)),
    ) ?? null
  );
}

/** Aktuellen Tier in der Matrix hervorheben (UI-Kontrast ist Sache der View). */
export function isCurrentTierCell(cellTier: SubscriptionTier, currentTier: SubscriptionTier): boolean {
  return cellTier === currentTier;
}

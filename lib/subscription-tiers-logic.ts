/**
 * Sprint 70 — Abonnement-Stufen (Lite, Pro, Expert) — reine Logik.
 *
 * Tarife werden ueber Stripe-Preis-IDs (STRIPE_PRICE_ID_LITE/PRO/EXPERT)
 * aufgeloest. Die Stufen sind direkt mit der Rechteverwaltung verknuepft:
 * Jeder Stufe ist ein fester Entitlement-Satz zugeordnet, der Server und
 * Client identisch auswerten — Features werden augenblicklich freigeschaltet
 * bzw. eingeschraenkt.
 */

export const SUBSCRIPTION_TIERS = ["lite", "pro", "expert"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  lite: "Lite",
  pro: "Pro",
  expert: "Expert",
};

/** Aufsteigende Stufen-Ordnung fuer Upgrade-/Downgrade-Entscheidungen. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  lite: 1,
  pro: 2,
  expert: 3,
};

/** Preis-Env-Variablen je Stufe (im Stripe-Dashboard als aktive wiederkehrende Preise anlegen). */
export const TIER_PRICE_ENV: Record<SubscriptionTier, string> = {
  lite: "STRIPE_PRICE_ID_LITE",
  pro: "STRIPE_PRICE_ID_PRO",
  expert: "STRIPE_PRICE_ID_EXPERT",
};

/** Freigeschaltete Module je Stufe — identisch fuer Server (Enforcement) und UI. */
export const TIER_ENTITLEMENTS: Record<SubscriptionTier, readonly string[]> = {
  lite: ["workspace", "chat"],
  pro: ["workspace", "chat", "agent", "preview", "quality"],
  expert: ["workspace", "chat", "agent", "preview", "quality", "account", "ki_provider"],
};

export type TierEnv = Pick<Record<SubscriptionTier, string | undefined>, SubscriptionTier>;

/**
 * Liest die konfigurierte Preis-ID einer Stufe aus der Umgebung.
 * Deterministisch: reine String-Normalisierung, keine Netzwerkaufrufe.
 */
export function tierPriceId(tier: SubscriptionTier, env: Record<string, string | undefined>): string | null {
  const value = env[TIER_PRICE_ENV[tier]]?.trim();
  return value ? value : null;
}

/**
 * Leitet die Stufe aus einer Stripe-Preis-ID ab. Ohne Treffer (null) gilt
 * die niedrigste Stufe — nie "mehr Rechte als bezahlt".
 */
export function tierFromPriceId(priceId: string | null | undefined, env: Record<string, string | undefined>): SubscriptionTier {
  if (priceId) {
    for (const tier of SUBSCRIPTION_TIERS) {
      if (tierPriceId(tier, env) === priceId) return tier;
    }
  }
  return "lite";
}

export function entitlementsForTier(tier: SubscriptionTier): readonly string[] {
  return TIER_ENTITLEMENTS[tier];
}

/** true, wenn die aktuelle Stufe das Modul (Entitlement) freischaltet. */
export function tierHasEntitlement(tier: SubscriptionTier, feature: string): boolean {
  return TIER_ENTITLEMENTS[tier].includes(feature);
}

/** Administratoren sind niemals durch Tarife beschraenkt (Superadmin). */
export function entitlementsForRole(role: string | undefined | null, tier: SubscriptionTier): readonly string[] {
  return role === "admin" ? TIER_ENTITLEMENTS.expert : TIER_ENTITLEMENTS[tier];
}

export function isTierUpgrade(from: SubscriptionTier, to: SubscriptionTier): boolean {
  return TIER_RANK[to] > TIER_RANK[from];
}

export function isTierDowngrade(from: SubscriptionTier, to: SubscriptionTier): boolean {
  return TIER_RANK[to] < TIER_RANK[from];
}

/**
 * Upgrade/Downgrade-Entscheidung: Upgrades und Cross-Grade (gleiche Stufe)
 * sind sofort erlaubt; Downgrades nur im Portal bzw. periodeversetzt.
 */
export type TierChangeDecision =
  | { allowed: true; immediate: true }
  | { allowed: true; immediate: false; reason: string }
  | { allowed: false; reason: string };

export function evaluateTierChange(current: SubscriptionTier, requested: SubscriptionTier): TierChangeDecision {
  if (requested === current) return { allowed: true, immediate: false, reason: "Gleiche Stufe — keine Änderung nötig." };
  if (isTierUpgrade(current, requested)) return { allowed: true, immediate: true };
  return {
    allowed: true,
    immediate: false,
    reason: "Downgrades werden zum Ende der bezahlten Periode wirksam — Verwaltung über das Kundenportal.",
  };
}

export function isSubscriptionTier(value: unknown): value is SubscriptionTier {
  return typeof value === "string" && (SUBSCRIPTION_TIERS as readonly string[]).includes(value);
}

/**
 * RBAC-Zugriffskontrolle (rein, testbar) — Tier-Modell und Admin-Override.
 *
 * Rollen-Tiers: free / pro / developer-max / elite. Elite entsteht nur aus
 * Owner- oder Admin-Rolle (Server-seitig geprueft) — der Override umgeht
 * Caps, Rate-Limits und Feature-Gates. Alles hier ist pure Logik; die
 * Autoritaet (Rolle aus der DB, tRPC-Kontext) bleibt beim Server.
 */

import { type SubscriptionTier } from "./subscription-tiers-logic";

export type RoleTier = "free" | "pro" | "developer-max" | "elite";

export const ROLE_TIERS: readonly RoleTier[] = ["free", "pro", "developer-max", "elite"];

export const ROLE_TIER_LABELS: Record<RoleTier, string> = {
  free: "Free",
  pro: "Pro",
  "developer-max": "Developer Max",
  elite: "Elite (Admin)",
};

export const ROLE_TIER_RANK: Record<RoleTier, number> = {
  free: 0,
  pro: 1,
  "developer-max": 2,
  elite: 3,
};

/** Subscription-Tier (lite/pro/expert) auf den RBAC-Tier abbilden. */
export function resolveAccessTier(input: {
  subscriptionTier?: SubscriptionTier | null;
  isAdmin?: boolean;
  isOwner?: boolean;
}): RoleTier {
  if (input.isOwner || input.isAdmin) return "elite";
  switch (input.subscriptionTier) {
    case "expert":
      return "developer-max";
    case "pro":
      return "pro";
    default:
      return "free";
  }
}

export type AccessFeature =
  | "agent.autopilot"
  | "agent.goal-graphs"
  | "mcp.tools"
  | "model.flagship"
  | "provider.custom-keys"
  | "key-pool.rotation"
  | "github.integration"
  | "workspace.bridge"
  | "metering.export"
  | "admin.dashboard"
  | "admin.quota-override";

const FREE_FEATURES: readonly AccessFeature[] = ["agent.autopilot"];
const PRO_FEATURES: readonly AccessFeature[] = [...FREE_FEATURES, "workspace.bridge", "github.integration"];
const DEVMAX_FEATURES: readonly AccessFeature[] = [
  ...PRO_FEATURES,
  "agent.goal-graphs",
  "mcp.tools",
  "model.flagship",
  "provider.custom-keys",
  "key-pool.rotation",
  "metering.export",
];
const ELITE_FEATURES: readonly AccessFeature[] = [...DEVMAX_FEATURES, "admin.dashboard", "admin.quota-override"];

export const TIER_FEATURES: Record<RoleTier, readonly AccessFeature[]> = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  "developer-max": DEVMAX_FEATURES,
  elite: ELITE_FEATURES,
};

export type AccessDecision = { allowed: boolean; reason: string; tier: RoleTier };

/** Feature-Gate: Hat der Tier Zugriff — Elite/Admin-Override greift nur server-seitig. */
export function canAccess(feature: AccessFeature, tier: RoleTier, override?: { isAdmin: boolean }): AccessDecision {
  const effectiveTier: RoleTier = override?.isAdmin === true ? "elite" : tier;
  if (TIER_FEATURES[effectiveTier].includes(feature)) {
    return { allowed: true, reason: "Freigegeben", tier: effectiveTier };
  }
  return {
    allowed: false,
    reason: `Feature "${feature}" erfordert mindestens ${requiredTierFor(feature)}`,
    tier: effectiveTier,
  };
}

/** Minimaler Tier, der ein Feature freischaltet (fuer Fehlermeldungen). */
export function requiredTierFor(feature: AccessFeature): RoleTier {
  return ROLE_TIERS.find((tier) => TIER_FEATURES[tier].includes(feature)) ?? "elite";
}

export type QuotaCaps = {
  maxTokensPerDay: number;
  maxAgentIterations: number;
  maxCustomProviderKeys: number;
  maxMcpConnectors: number;
  requestsPerMinute: number;
};

export const TIER_QUOTA_CAPS: Record<RoleTier, QuotaCaps> = {
  free: { maxTokensPerDay: 50_000, maxAgentIterations: 40, maxCustomProviderKeys: 0, maxMcpConnectors: 0, requestsPerMinute: 10 },
  pro: { maxTokensPerDay: 500_000, maxAgentIterations: 60, maxCustomProviderKeys: 1, maxMcpConnectors: 2, requestsPerMinute: 30 },
  "developer-max": { maxTokensPerDay: 5_000_000, maxAgentIterations: 80, maxCustomProviderKeys: 5, maxMcpConnectors: 8, requestsPerMinute: 60 },
  elite: {
    maxTokensPerDay: Number.MAX_SAFE_INTEGER,
    maxAgentIterations: 200,
    maxCustomProviderKeys: Number.MAX_SAFE_INTEGER,
    maxMcpConnectors: Number.MAX_SAFE_INTEGER,
    requestsPerMinute: 240,
  },
};

/** Admin-/Elite-Quota-Override: Einzelwerte anheben (nie senken). */
export function applyAdminQuotaOverride(
  caps: QuotaCaps,
  overrides: Partial<Record<keyof QuotaCaps, number>>,
  options: { isAdmin: boolean },
): QuotaCaps {
  if (!options.isAdmin) return caps;
  const merged: QuotaCaps = { ...caps };
  for (const [key, value] of Object.entries(overrides) as [keyof QuotaCaps, number][]) {
    if (Number.isFinite(value) && value > merged[key]) {
      merged[key] = value;
    }
  }
  return merged;
}

/** Server-Enforcementpunkt: einmalige Pruefung fuer tRPC-Router. */
export function enforceServerAccess(input: {
  feature: AccessFeature;
  role?: string | null;
  isOwner?: boolean;
  subscriptionTier?: SubscriptionTier | null;
}): AccessDecision {
  const isAdmin = input.role === "admin";
  const tier = resolveAccessTier({ subscriptionTier: input.subscriptionTier, isAdmin, isOwner: input.isOwner });
  return canAccess(input.feature, tier, { isAdmin });
}

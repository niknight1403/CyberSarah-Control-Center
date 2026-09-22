/**
 * berechtigungen — Zentrale Rechte-Matrix für CyberSarah Revenue OS
 *
 * Ein Recht pro Feature-Bereich. Der Administrator bekommt "*" (alle Rechte),
 * reguläre Tenant-Nutzer erhalten die Rechte ihres Abo-Tiers.
 */
import type { PlanTier } from "@workspace/db";

export type Recht =
  | "dashboard"
  | "ki_persoenlichkeiten"
  | "schwarm"
  | "content_generierung"
  | "social_connectoren"
  | "produkte_anlegen"
  | "stripe_abos"
  | "affiliate_engine"
  | "email_marketing"
  | "api_zugang"
  | "webhooks"
  | "mcp_integration"
  | "eigene_skills"
  | "llm_router_kostenlos"
  | "api_key_rotierer"
  | "problem_loeser"
  | "analytics"
  | "white_label"
  | "multi_tenant"
  | "sla_garantie";

export const ALLE_RECHTE: Recht[] = [
  "dashboard", "ki_persoenlichkeiten", "schwarm", "content_generierung",
  "social_connectoren", "produkte_anlegen", "stripe_abos", "affiliate_engine",
  "email_marketing", "api_zugang", "webhooks", "mcp_integration",
  "eigene_skills", "llm_router_kostenlos", "api_key_rotierer", "problem_loeser",
  "analytics", "white_label", "multi_tenant", "sla_garantie",
];

/** Rechte je Abo-Tier (kumulative Staffelung) */
const TIER_RECHTE: Record<PlanTier, Recht[]> = {
  lite: ["dashboard", "ki_persoenlichkeiten", "content_generierung", "produkte_anlegen", "analytics"],
  standard: [
    "dashboard", "ki_persoenlichkeiten", "schwarm", "content_generierung", "social_connectoren",
    "produkte_anlegen", "affiliate_engine", "email_marketing", "analytics",
  ],
  pro: ALLE_RECHTE.filter((r) => r !== "white_label" && r !== "multi_tenant" && r !== "sla_garantie"),
  elite: ALLE_RECHTE,
};

export function rechteFuerTier(tier: PlanTier): Recht[] {
  return TIER_RECHTE[tier] ?? TIER_RECHTE.lite;
}

/** Prüft, ob ein Nutzer (Berechtigungen-Array oder Tier) ein Recht besitzt. */
export function hatRecht(
  nutzer: { berechtigungen?: string | null; planTier?: string | null },
  recht: Recht,
): boolean {
  const liste = parseBerechtigungen(nutzer.berechtigungen);
  if (liste.includes("*")) return true; // Administrator
  if (liste.length > 0) return liste.includes(recht);
  // Fallback über Tier
  const tier = (["lite", "standard", "pro", "elite"] as string[]).includes(String(nutzer.planTier))
    ? (nutzer.planTier as PlanTier)
    : "lite";
  return rechteFuerTier(tier).includes(recht);
}

export function parseBerechtigungen(roh?: string | null): string[] {
  if (!roh) return [];
  try {
    const geparst = JSON.parse(roh);
    return Array.isArray(geparst) ? geparst.map(String) : [];
  } catch {
    return [];
  }
}

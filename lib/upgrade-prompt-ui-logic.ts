/**
 * Sprint 315 — Upgrade-Prompt (UI-Schicht): reine, deterministische
 * Logik fuer den einheitlichen Upgrade-Hinweis an allen Quota-Grenzen
 * in der App. Baut auf dem Server-Gate aus Sprint 262
 * (lib/upgrade-prompt-logic.ts, buildQuotaUpgradePrompt) auf und
 * entscheidet hier NUR die Client-Darstellung: zeigen, verwerfbar,
 * Texte — konsistent, ohne Dark Patterns.
 *
 * Ehrlichkeits-Grenze: Kein kuenstlicher Druck (keine Countdowns,
 *   keine Fake-Verknappung). Der Prompt verschwindet ehrlich: einmal
 *   pro Feature pro Tag, nicht bei jedem Request nerven.
 */

import { SUBSCRIPTION_TIERS, type SubscriptionTier, isSubscriptionTier } from "./subscription-tiers-logic";

export const UPGRADE_PROMPT_LIMITS = {
  /** Prompt-Schwelle: ab dieser Verbrauchs-Ratio erscheint der Hinweis. */
  showFromRatio: 0.9,
  /** Max. Ausblendungen pro Feature und Tag, danach bleibt er stehen. */
  maxDismissalsPerDay: 1,
} as const;

export type UpgradePromptContext = {
  featureLabel: string;
  currentTier: SubscriptionTier;
  used: number;
  limit: number;
  /** Bereits heute vom Nutzer verworfen (pro Feature). */
  dismissalsToday: number;
};

export type UpgradePromptDecision =
  | { show: true; title: string; body: string; ctaLabel: string; dismissible: boolean }
  | { show: false; reason: "unter schwelle" | "limit ungueltig" | "bereits verworfen" };

/** Kernentscheidung: Prompt zeigen? Rein aus Verbrauch + History. */
export function decideUpgradePrompt(ctx: UpgradePromptContext): UpgradePromptDecision {
  if (ctx.limit <= 0) {
    return { show: false, reason: "limit ungueltig" };
  }
  const ratio = ctx.used / ctx.limit;
  if (ratio < UPGRADE_PROMPT_LIMITS.showFromRatio) {
    return { show: false, reason: "unter schwelle" };
  }
  if (ctx.dismissalsToday >= UPGRADE_PROMPT_LIMITS.maxDismissalsPerDay) {
    return { show: false, reason: "bereits verworfen" };
  }
  const nextTier = nextUpgradeTier(ctx.currentTier);
  const remaining = Math.max(0, ctx.limit - ctx.used);
  return {
    show: true,
    title: `${ctx.featureLabel}: fast am Tageslimit`,
    body: `Noch ${remaining} von ${ctx.limit} heute übrig (Tier "${ctx.currentTier}"). ${
      nextTier
        ? `Mit "${nextTier}" erhöhst du das Limit — Entscheidung liegt bei dir, kein Zeitdruck.`
        : `Du bist bereits im höchsten Tier.`
    }`,
    ctaLabel: nextTier ? `Upgrade auf ${nextTier}` : "Tiers ansehen",
    dismissible: true,
  };
}

/** Naechst-hoeherer Tier oder null (hoechster erreicht). */
export function nextUpgradeTier(current: SubscriptionTier): SubscriptionTier | null {
  const idx = SUBSCRIPTION_TIERS.indexOf(current);
  if (idx < 0 || idx + 1 >= SUBSCRIPTION_TIERS.length) return null;
  return SUBSCRIPTION_TIERS[idx + 1];
}

/** Verwerfung buchen: ehrlich zaehlen, nie zuruecksetzen am selben Tag. */
export function recordDismissal(dismissalsToday: number): number {
  return dismissalsToday + 1;
}

/** Prueft einen Tier-Wert aus fremder Eingabe (z. B. Account-Daten). */
export function parseTierOrFallback(raw: unknown): SubscriptionTier {
  return isSubscriptionTier(raw) ? raw : "lite";
}

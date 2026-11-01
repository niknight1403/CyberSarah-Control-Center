/**
 * Sprint 262 — Ehrliche Upgrade-Prompts an Quota-Grenzen (rein, testbar).
 *
 * Grundsatz: Eine Grenze ist kein Verkaufsdruck, sondern ein Fakt. Der
 * Prompt nennt den Zustand, die Zahlen und den naechsten Schritt — ohne
 * Angst-Appell, ohne kuenstliche Verknappung, ohne "nur noch heute".
 *   - Wer aufgefordert wird zu zahlen, bekommt den Grund zu sehen.
 *   - Was nicht konfiguriert ist (kein Preis hinterlegbar), wird ehrlich
 *     als "Upgrade noch nicht verfuegbar" benannt statt totzulinken.
 */

export type PlanId = "free" | "lite" | "pro" | "expert";

export type QuotaGateInput = {
  usedToday: number;
  dailyLimit: number;
  resetsAt: string;
  plan: PlanId;
  quotaExempt: boolean;
};

export type UpgradePrompt = {
  headline: string;
  detail: string;
  cta: { tier: Exclude<PlanId, "free">; action: "checkout" } | { tier: null; action: "wait" };
  urgency: false;
};

const NEXT_PAID_TIER: Partial<Record<PlanId, Exclude<PlanId, "free">>> = {
  free: "lite",
  lite: "pro",
  pro: "expert",
};

export const RESET_LABEL = "naechte UTC-Mitternacht";

export const SOFT_WARNING_RATIO = 0.8;

export function buildQuotaUpgradePrompt(
  gate: QuotaGateInput,
  tierPricesConfigured: (tier: Exclude<PlanId, "free">) => boolean,
): { level: "ok" | "soft" | "blocked"; prompt: UpgradePrompt | null } {
  if (gate.quotaExempt) return { level: "ok", prompt: null };

  if (gate.usedToday >= gate.dailyLimit) {
    const nextTier = NEXT_PAID_TIER[gate.plan] ?? null;
    const cta: UpgradePrompt["cta"] = nextTier && tierPricesConfigured(nextTier)
      ? { tier: nextTier, action: "checkout" }
      : { tier: null, action: "wait" };
    return {
      level: "blocked",
      prompt: {
        headline: "Tageslimit erreicht",
        detail: `Du hast heute ${gate.usedToday} von ${gate.dailyLimit} Nachrichten genutzt (${gate.plan === "free" ? "kostenloser" : gate.plan.toUpperCase() + "-"}Plan). Das Limit setzt um ${RESET_LABEL} zurueck (${gate.resetsAt}).${cta.action === "checkout" ? ` Der ${cta.tier.toUpperCase()}-Plan hebt das Limit — Wechsel freiwillig, kein Zeitdruck.` : " Ein Upgrade ist derzeit nicht konfiguriert; das Limit greift bis zum Reset."}`,
        cta,
        urgency: false,
      },
    };
  }

  if (gate.usedToday / Math.max(gate.dailyLimit, 1) >= SOFT_WARNING_RATIO) {
    return {
      level: "soft",
      prompt: {
        headline: "Tageslimit bald erreicht",
        detail: `Noch ${gate.dailyLimit - gate.usedToday} von ${gate.dailyLimit} Nachrichten heute (${gate.usedToday} benutzt). Zuruecksetzung um ${RESET_LABEL}.`,
        cta: { tier: null, action: "wait" },
        urgency: false,
      },
    };
  }

  return { level: "ok", prompt: null };
}

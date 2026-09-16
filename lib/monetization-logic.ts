/**
 * Monetarisierungs-Logik (Sprint 124) — reine, testbare Kernlogik.
 *
 * Freemium-Modell:
 *   - FREE: Lokale Ausfuehrung (eigene Provider-Keys / Ollama) unbegrenzt —
 *     eigene Infrastruktur kostet den Betreiber nichts. Der verwaltete
 *     Cloud-Pool (Managed LLM) bekommt ein Tagestrial-Kontingent.
 *   - LITE/PRO/EXPERT: Monatliche Abos (Stripe und/oder Google Play Billing)
 *     mit steigenden Cloud-Token-Kontingenten und Multi-Agenten-Freischaltung.
 *   - CREDITS: Verbrauchsbasierte Token-Pakete (Consumables) als Ergaenzung,
 *     wenn das Abo-Kontingent aufgebraucht ist — Pay-as-you-go.
 *
 * Diese Datei bewusst frei von Server- und UI-Importen: Server (Enforcement)
 * und Client (Paywall) werten identisch aus.
 */

export type MonetizationPlan = "free" | "lite" | "pro" | "expert";

export interface PlanLimits {
  label: string;
  /** Max. verwaltete Cloud-Token pro Tag (eigene Provider immer frei). */
  dailyCloudTokens: number;
  /** Max. verwaltete Cloud-Token pro Kalendermonat. */
  monthlyCloudTokens: number;
  /** Parallele Agenten-Workflows im Orchestrator. */
  maxParallelAgents: number;
  /** Multi-Agenten-Cloud-Workflows freigeschaltet? */
  cloudWorkflows: boolean;
  /** Prioritaet im verwalteten LLM-Pool (hoeher = besser). */
  poolPriority: number;
}

export const PLAN_LIMITS: Record<MonetizationPlan, PlanLimits> = {
  free: { label: "Free", dailyCloudTokens: 10_000, monthlyCloudTokens: 50_000, maxParallelAgents: 1, cloudWorkflows: false, poolPriority: 0 },
  lite: { label: "Lite", dailyCloudTokens: 30_000, monthlyCloudTokens: 200_000, maxParallelAgents: 2, cloudWorkflows: true, poolPriority: 1 },
  pro: { label: "Pro", dailyCloudTokens: 100_000, monthlyCloudTokens: 1_000_000, maxParallelAgents: 5, cloudWorkflows: true, poolPriority: 2 },
  expert: { label: "Expert", dailyCloudTokens: 300_000, monthlyCloudTokens: 3_000_000, maxParallelAgents: 10, cloudWorkflows: true, poolPriority: 3 },
};

export interface CreditPack {
  id: string;
  label: string;
  tokens: number;
  /** Preis in Euro (Google Play Billing / Stripe共用 Catalog-Preis). */
  priceEur: number;
}

/** Verbrauchbare Token-Pakete (Google-Play-Consumables). */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "credits_small", label: "50.000 Cloud-Tokens", tokens: 50_000, priceEur: 4.99 },
  { id: "credits_medium", label: "250.000 Cloud-Tokens", tokens: 250_000, priceEur: 19.99 },
  { id: "credits_large", label: "1.000.000 Cloud-Tokens", tokens: 1_000_000, priceEur: 59.99 },
];

export interface MonetizationAccountState {
  plan: MonetizationPlan;
  /**
   * Sprint 144 — Dauerhafte Admin-Elite-Garantie: Der Administrator-Zugang
   * hat unabhaengig von Billing-Zyklen dauerhaft das Elite-Paket mit
   * unbegrenzter Quota. Das Flag wird serverseitig gesetzt und ueberlebt
   * Plan- und Periodenwechsel.
   */
  adminGuaranteed?: boolean;
  /** Tages-Zaehler (YYYY-MM-DD). */
  dayKey: string;
  dayCloudTokens: number;
  /** Monats-Zaehler (YYYY-MM). */
  monthKey: string;
  monthCloudTokens: number;
  /** Guthaben aus gekauften Credit-Packs (Tokens). */
  creditBalanceTokens: number;
  updatedAt: string;
}

export type QuotaLimitKind = "daily" | "monthly" | "none";

export interface QuotaCheck {
  allowed: boolean;
  /** "none" = Abo-Kontingent greift, "daily"/"monthly" = Limit verletzt. */
  limitKind: QuotaLimitKind;
  /** true = Verbrauch wird dem Guthaben belastet (Kontingent erschoepft). */
  usesCredits: boolean;
  remainingToday: number;
  remainingThisMonth: number;
  reason?: string;
}

export function dayKeyOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function monthKeyOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function freshAccountState(now = new Date()): MonetizationAccountState {
  return {
    plan: "free",
    dayKey: dayKeyOf(now),
    dayCloudTokens: 0,
    monthKey: monthKeyOf(now),
    monthCloudTokens: 0,
    creditBalanceTokens: 0,
    updatedAt: now.toISOString(),
  };
}

/** Perioden-Zaehler bei Tages-/Monatswechsel zuruecksetzen (rollierend). */
export function rollPeriods(state: MonetizationAccountState, now = new Date()): MonetizationAccountState {
  const dayKey = dayKeyOf(now);
  const monthKey = monthKeyOf(now);
  if (state.dayKey === dayKey && state.monthKey === monthKey) return state;
  return {
    ...state,
    dayKey,
    dayCloudTokens: state.dayKey === dayKey ? state.dayCloudTokens : 0,
    monthKey,
    monthCloudTokens: state.monthKey === monthKey ? state.monthCloudTokens : 0,
    updatedAt: now.toISOString(),
  };
}

/**
 * Echtzeit-Quota-Pruefung vor einem verwalteten Cloud-Aufruf.
 * Reihenfolge: Tageslimit -> Monatslimit -> Guthaben (Credits).
 * Eigene Provider-Keys / Ollama laufen NIE durch diese Pruefung.
 */
/** Sprint 144 — Admin-Konto dauerhaft auf Elite (expert) heben. */
export function ensureAdminElitePlan(state: MonetizationAccountState): MonetizationAccountState {
  if (state.adminGuaranteed === true && state.plan === "expert") return state;
  return { ...state, plan: "expert", adminGuaranteed: true };
}

export function checkQuota(
  state: MonetizationAccountState,
  estimatedTokens: number,
  now = new Date(),
): QuotaCheck {
  // Admin-Elite-Garantie: nie blockieren, unbegrenzt — auch nicht im
  // enforce-Modus. Verbrauch wird nur noch gezaehlt (Metering), nie gedrosselt.
  if (state.adminGuaranteed === true) {
    return {
      allowed: true,
      limitKind: "none",
      usesCredits: false,
      remainingToday: Number.MAX_SAFE_INTEGER,
      remainingThisMonth: Number.MAX_SAFE_INTEGER,
    };
  }
  const limits = PLAN_LIMITS[state.plan];
  const rolled = rollPeriods(state, now);
  const remainingToday = Math.max(0, limits.dailyCloudTokens - rolled.dayCloudTokens);
  const remainingThisMonth = Math.max(0, limits.monthlyCloudTokens - rolled.monthCloudTokens);

  if (estimatedTokens <= remainingToday && estimatedTokens <= remainingThisMonth) {
    return { allowed: true, limitKind: "none", usesCredits: false, remainingToday, remainingThisMonth };
  }

  const kind: QuotaLimitKind = estimatedTokens > remainingThisMonth ? "monthly" : "daily";
  const deficit = estimatedTokens - (kind === "daily" ? remainingToday : remainingThisMonth);

  if (rolled.creditBalanceTokens >= deficit) {
    return {
      allowed: true,
      limitKind: kind,
      usesCredits: true,
      remainingToday,
      remainingThisMonth,
      reason: `Abo-Kontingent (${limits.label}) ueberschritten — Verbrauch wird dem Guthaben belastet.`,
    };
  }

  return {
    allowed: false,
    limitKind: kind,
    usesCredits: false,
    remainingToday,
    remainingThisMonth,
    reason:
      kind === "daily"
        ? `Tageslimit erreicht (${limits.dailyCloudTokens.toLocaleString("de-DE")} Tokens). Upgrade oder Credit-Pack noetig.`
        : `Monatslimit erreicht (${limits.monthlyCloudTokens.toLocaleString("de-DE")} Tokens). Upgrade oder Credit-Pack noetig.`,
  };
}

/**
 * Verbrauch verbuchen (nach erfolgreichem Cloud-Aufruf):
 * Erst Kontingent, dann Guthaben. Muss nach checkQuota==allowed laufen.
 */
export function consumeQuota(
  state: MonetizationAccountState,
  actualTokens: number,
  now = new Date(),
): MonetizationAccountState {
  const limits = PLAN_LIMITS[state.plan];
  let rolled = rollPeriods(state, now);
  const remainingToday = Math.max(0, limits.dailyCloudTokens - rolled.dayCloudTokens);
  const fromPlan = Math.min(actualTokens, remainingToday);
  const overflow = actualTokens - fromPlan;

  rolled = {
    ...rolled,
    dayCloudTokens: rolled.dayCloudTokens + fromPlan,
    monthCloudTokens: rolled.monthCloudTokens + fromPlan,
    creditBalanceTokens: Math.max(0, rolled.creditBalanceTokens - overflow),
    updatedAt: now.toISOString(),
  };
  return rolled;
}

/** Guthaben aus einem gekauften Credit-Pack gutschreiben. */
export function applyCreditPack(state: MonetizationAccountState, packId: string, now = new Date()): MonetizationAccountState | null {
  const pack = CREDIT_PACKS.find((entry) => entry.id === packId);
  if (!pack) return null;
  return {
    ...rollPeriods(state, now),
    creditBalanceTokens: state.creditBalanceTokens + pack.tokens,
    updatedAt: now.toISOString(),
  };
}

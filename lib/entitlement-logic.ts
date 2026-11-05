/**
 * Berechtigungen aus einem Stripe-Checkout (rein, ohne I/O).
 *
 * Ziel: Ein abgeschlossener Checkout führt zu genau einer Gutschrift oder
 * Plan-Freischaltung — nachvollziehbar, idempotent und ohne Doppelbuchung bei
 * erneuter Zustellung desselben Events.
 *
 * Ehrlichkeitsregeln:
 *  - Ohne bestätigte Zahlung wird nichts gutgeschrieben (`payment_status` muss
 *    "paid" sein; Abos laufen über `mode: "subscription"`).
 *  - Unbekannte Paket-Kennungen werden nicht geraten: Ergebnis ist "none" mit
 *    Begründung, damit es im Webhook-Log auffällt statt still zu wirken.
 *  - Der Idempotenz-Schlüssel enthält die Checkout-Session-ID. Stripe liefert
 *    Events mehrfach; die Buchung darf dadurch nicht doppelt entstehen.
 */
import { CREDIT_PACKS, PLAN_LIMITS, type MonetizationPlan } from "./monetization-logic";
import { CREDIT_PACKS_CANONICAL, findCreditPack, findCreditPackByPriceId } from "./pricing-config";

export type CheckoutEntitlementKind = "credits" | "plan" | "none";

export interface CheckoutSummary {
  id?: string | null;
  mode?: string | null;
  paymentStatus?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  userId?: number | null;
  /** `client_reference_id` aus Stripe (Nutzer-ID oder openId). */
  clientReferenceId?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

export interface CheckoutEntitlement {
  kind: CheckoutEntitlementKind;
  /** Anzahl Tokens bei `kind: "credits"`. */
  tokens?: number;
  /** Zielplan bei `kind: "plan"`. */
  plan?: MonetizationPlan;
  reason: string;
  /** Stabiler Schlüssel für die Buchung (Idempotenz). */
  idempotencyKey: string | null;
}

const PLAN_NAMES: MonetizationPlan[] = ["free", "lite", "pro", "expert"];

function asPlan(value: string | undefined): MonetizationPlan | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  return (PLAN_NAMES.find((plan) => plan === clean) as MonetizationPlan | undefined) ?? null;
}

/** Token-Menge aus Metadaten: direkte Zahl oder Paket-Kennung. */
export function resolveCreditTokens(metadata: Record<string, string | undefined>): number | null {
  const direct = metadata.credits ?? metadata.tokens ?? metadata.credit_tokens;
  if (direct !== undefined) {
    const parsed = Number.parseInt(String(direct).trim(), 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  // Kanonische Kennung zuerst (credit_pack_*), danach Altbestand (credits_*).
  const packId = (
    metadata.creditPackageId ??
    metadata.creditPackage ??
    metadata.credit_package ??
    metadata.pack ??
    ""
  ).trim();
  if (packId) {
    const canonical = findCreditPack(packId);
    if (canonical) return canonical.tokens;
    const legacy = CREDIT_PACKS.find((entry) => entry.id === packId);
    if (legacy) return legacy.tokens;
    return null;
  }
  // Ohne Kennung, aber mit Preis: Paket über die Stripe-Preis-ID bestimmen.
  const priced = findCreditPackByPriceId(metadata.stripePriceId ?? metadata.priceId ?? null);
  return priced ? priced.tokens : null;
}

/**
 * Was folgt aus diesem Checkout? Reine Entscheidung, keine Buchung.
 */
export function decideCheckoutEntitlement(session: CheckoutSummary): CheckoutEntitlement {
  const key = session.id ? `stripe_payment:${session.id}` : null;
  const metadata = session.metadata ?? {};
  const paid = String(session.paymentStatus ?? "").toLowerCase() === "paid";
  const mode = String(session.mode ?? "").toLowerCase();

  if (!session.id) {
    return { kind: "none", reason: "Checkout ohne Session-ID — keine Buchung möglich.", idempotencyKey: null };
  }

  const tokens = resolveCreditTokens(metadata);
  const plan = asPlan(metadata.tier ?? metadata.plan ?? metadata.planType ?? metadata.plan_type);

  // Guthaben-Kauf: nur mit bestätigter Zahlung.
  if (tokens !== null) {
    if (!paid) {
      return {
        kind: "none",
        reason: `Zahlung nicht bestätigt (payment_status=${session.paymentStatus ?? "unbekannt"}).`,
        idempotencyKey: key,
      };
    }
    return {
      kind: "credits",
      tokens,
      reason: `Guthaben-Kauf über ${tokens} Tokens bestätigt.`,
      idempotencyKey: key,
    };
  }

  // Abo: der Plan kommt aus dem Abo, nicht aus dem Betrag. Ohne Metadaten bleibt
  // die Plan-Freischaltung dem Subscription-Sync überlassen.
  if (mode === "subscription") {
    if (!plan) {
      return {
        kind: "none",
        reason: "Abo-Checkout ohne Plan-Angabe; Freischaltung erfolgt über den Subscription-Sync.",
        idempotencyKey: key,
      };
    }
    return {
      kind: "plan",
      plan,
      reason: `Abo-Checkout für Plan ${plan}.`,
      idempotencyKey: key,
    };
  }

  // Einmalzahlung ohne Guthaben-Angabe: nichts erfinden, nur benennen.
  if (paid && tokens === null) {
    return {
      kind: "none",
      reason: "Zahlung bestätigt, aber keine Guthaben- oder Plan-Angabe in den Metadaten.",
      idempotencyKey: key,
    };
  }

  return {
    kind: "none",
    reason: `Kein Handlungsbedarf (mode=${session.mode ?? "unbekannt"}, payment_status=${session.paymentStatus ?? "unbekannt"}).`,
    idempotencyKey: key,
  };
}

export interface EntitlementView {
  plan: MonetizationPlan;
  planLabel: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  creditsBalanceTokens: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    dailyCloudTokens: number;
    monthlyCloudTokens: number;
    maxParallelAgents: number;
    cloudWorkflows: boolean;
  };
  creditPacks: { id: string; label: string; tokens: number; priceEur: number }[];
}

/**
 * Anzeige-Sicht für den Client (das, was eine user_subscriptions-Tabelle leisten
 * sollte) — gebildet aus Abo, Plan und Guthaben, ohne doppelte Datenhaltung.
 */
export function buildEntitlementView(input: {
  plan: MonetizationPlan;
  subscription: { status?: string | null; currentPeriodEnd?: Date | null; cancelAtPeriodEnd?: boolean | null } | null;
  creditsBalanceTokens: number | null;
  adminGuaranteed?: boolean;
}): EntitlementView {
  const plan = input.adminGuaranteed ? "expert" : input.plan;
  const rawStatus = String(input.subscription?.status ?? "").toLowerCase();
  const status: EntitlementView["status"] =
    rawStatus === "active"
      ? "active"
      : rawStatus === "trialing" || rawStatus === "trial"
        ? "trialing"
        : rawStatus === "past_due"
          ? "past_due"
          : rawStatus === "canceled" || rawStatus === "cancelled"
            ? "canceled"
            : rawStatus
              ? "canceled"
              : "none";
  const limits = PLAN_LIMITS[plan];
  return {
    plan,
    planLabel: limits.label,
    status,
    creditsBalanceTokens: input.creditsBalanceTokens,
    currentPeriodEnd: input.subscription?.currentPeriodEnd ? input.subscription.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(input.subscription?.cancelAtPeriodEnd),
    limits: {
      dailyCloudTokens: limits.dailyCloudTokens,
      monthlyCloudTokens: limits.monthlyCloudTokens,
      maxParallelAgents: limits.maxParallelAgents,
      cloudWorkflows: limits.cloudWorkflows,
    },
    creditPacks: CREDIT_PACKS_CANONICAL.map((pack) => ({
      id: pack.id,
      label: pack.label,
      tokens: pack.tokens,
      priceEur: pack.priceEur,
    })),
  };
}

/** Vorab-Prüfung für Routen: reicht das Guthaben für den geplanten Lauf? */
export function canAfford(balanceTokens: number | null, requiredTokens: number): {
  allowed: boolean;
  missingTokens: number | null;
} {
  if (balanceTokens === null) return { allowed: false, missingTokens: null };
  const required = Math.max(0, Math.ceil(requiredTokens));
  const missing = required - balanceTokens;
  return { allowed: missing <= 0, missingTokens: missing > 0 ? missing : 0 };
}

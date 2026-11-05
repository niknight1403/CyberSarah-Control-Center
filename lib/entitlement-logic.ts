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
  /** Stripe payment_intent — Anker fuer spaetere Erstattungen. */
  paymentIntent?: string | null;
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

/**
 * Herkunft der Gutschrift. Die kanonische Paket-Kennung gewinnt immer gegen
 * frei gesetzte Token-Zahlen in den Metadaten — sonst könnte ein manipuliertes
 * oder falsch gesetztes Feld die Gutschrift bestimmen.
 */
export type CreditGrant =
  | { source: "pack"; packId: string; tokens: number; currency: string; priceCents: number }
  | { source: "declared"; tokens: number }
  | { source: "unknown_pack"; packId: string }
  | { source: "none" };

/** Groesstes kanonisches Paket — Obergrenze fuer frei deklarierte Tokens. */
const MAX_DECLARED_TOKENS = Math.max(...CREDIT_PACKS_CANONICAL.map((pack) => pack.tokens));

export function resolveCreditGrant(metadata: Record<string, string | undefined>): CreditGrant {
  const packId = (
    metadata.creditPackageId ??
    metadata.creditPackage ??
    metadata.credit_package ??
    metadata.pack ??
    ""
  ).trim();

  if (packId) {
    const canonical = findCreditPack(packId);
    if (canonical) {
      return {
        source: "pack",
        packId: canonical.id,
        tokens: canonical.tokens,
        currency: "eur",
        priceCents: Math.round(canonical.priceEur * 100),
      };
    }
    const legacy = CREDIT_PACKS.find((entry) => entry.id === packId);
    if (legacy) {
      return {
        source: "pack",
        packId: legacy.id,
        tokens: legacy.tokens,
        currency: "eur",
        priceCents: Math.round(legacy.priceEur * 100),
      };
    }
    // Unbekannte Kennung: nicht raten, nicht auf eine Zahl ausweichen.
    return { source: "unknown_pack", packId };
  }

  const byPriceId = findCreditPackByPriceId(metadata.stripePriceId ?? metadata.priceId ?? null);
  if (byPriceId) {
    return {
      source: "pack",
      packId: byPriceId.id,
      tokens: byPriceId.tokens,
      currency: "eur",
      priceCents: Math.round(byPriceId.priceEur * 100),
    };
  }

  const direct = metadata.credits ?? metadata.tokens ?? metadata.credit_tokens;
  if (direct !== undefined) {
    const parsed = Number.parseInt(String(direct).trim(), 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      // Altbestand ohne Paket-Kennung: nur bis zur Groesse des groessten Pakets.
      return { source: "declared", tokens: Math.min(parsed, MAX_DECLARED_TOKENS) };
    }
  }
  return { source: "none" };
}

/** Token-Menge aus Metadaten (Kompatibilitaets-Wrapper). */
export function resolveCreditTokens(metadata: Record<string, string | undefined>): number | null {
  const grant = resolveCreditGrant(metadata);
  return grant.source === "pack" || grant.source === "declared" ? grant.tokens : null;
}

export function decideCheckoutEntitlement(session: CheckoutSummary): CheckoutEntitlement {
  const key = session.id ? `stripe_payment:${session.id}` : null;
  const metadata = session.metadata ?? {};
  const paid = String(session.paymentStatus ?? "").toLowerCase() === "paid";
  const mode = String(session.mode ?? "").toLowerCase();

  if (!session.id) {
    return { kind: "none", reason: "Checkout ohne Session-ID — keine Buchung möglich.", idempotencyKey: null };
  }

  const grant = resolveCreditGrant(metadata);
  const plan = asPlan(metadata.tier ?? metadata.plan ?? metadata.planType ?? metadata.plan_type);

  if (grant.source === "unknown_pack") {
    return {
      kind: "none",
      reason: `Unbekanntes Token-Paket "${grant.packId}" — keine Buchung.`,
      idempotencyKey: key,
    };
  }

  // Guthaben: ausschliesslich Einmalzahlungen. Ein Abo-Checkout darf nie
  // nebenbei Tokens buchen, auch wenn Metadaten ein Paket nennen.
  if (grant.source === "pack" || grant.source === "declared") {
    if (mode === "subscription") {
      return {
        kind: "none",
        reason: "Abo-Checkout nennt ein Token-Paket — bei Abos werden keine Tokens gebucht.",
        idempotencyKey: key,
      };
    }
    if (!paid) {
      return {
        kind: "none",
        reason: `Zahlung nicht bestätigt (payment_status=${session.paymentStatus ?? "unbekannt"}).`,
        idempotencyKey: key,
      };
    }
    if (typeof session.amountTotal === "number" && session.amountTotal <= 0) {
      return {
        kind: "none",
        reason: "Betrag ist 0 — kein Guthaben ohne Zahlung.",
        idempotencyKey: key,
      };
    }
    if (grant.source === "pack" && session.currency) {
      const currency = session.currency.trim().toLowerCase();
      if (currency !== grant.currency) {
        return {
          kind: "none",
          reason: `Waehrung ${currency.toUpperCase()} passt nicht zum Paket (${grant.currency.toUpperCase()}) — keine Buchung.`,
          idempotencyKey: key,
        };
      }
    }
    const delta =
      grant.source === "pack" && typeof session.amountTotal === "number"
        ? session.amountTotal - grant.priceCents
        : 0;
    const note =
      delta === 0
        ? ""
        : ` (gezahlt ${((session.amountTotal ?? 0) / 100).toFixed(2)} EUR statt ${(grant.source === "pack" ? grant.priceCents / 100 : 0).toFixed(2)} EUR)`;
    return {
      kind: "credits",
      tokens: grant.tokens,
      reason:
        grant.source === "pack"
          ? `Guthaben-Kauf ${grant.packId}: ${grant.tokens} Tokens${note}.`
          : `Guthaben-Kauf ueber ${grant.tokens} Tokens (ohne Paket-Kennung)${note}.`,
      idempotencyKey: key,
    };
  }

  // Abo: der Plan kommt aus dem Abo, nicht aus dem Betrag. Ohne Metadaten bleibt
  // die Plan-Freischaltung dem Subscription-Sync ueberlassen.
  if (mode === "subscription") {
    if (!plan) {
      return {
        kind: "none",
        reason: "Abo-Checkout ohne Plan-Angabe; Freischaltung erfolgt ueber den Subscription-Sync.",
        idempotencyKey: key,
      };
    }
    return {
      kind: "plan",
      plan,
      reason: `Abo-Checkout fuer Plan ${plan}.`,
      idempotencyKey: key,
    };
  }

  // Einmalzahlung ohne Guthaben-Angabe: nichts erfinden, nur benennen.
  return {
    kind: "none",
    reason: paid
      ? "Zahlung bestaetigt, aber keine Guthaben- oder Plan-Angabe in den Metadaten."
      : `Zahlung nicht bestaetigt (payment_status=${session.paymentStatus ?? "unbekannt"}).`,
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

/**
 * Tokens, die zu einer Erstattung gehoeren.
 *
 * Anteilig zum erstatteten Betrag, abgerundet: bei Teil-Erstattung werden nie
 * mehr Tokens entzogen als bezahlt wurden, bei voller Erstattung genau die
 * gutgeschriebene Menge.
 */
export function computeRefundTokens(input: {
  grantedTokens: number;
  paidCents: number;
  refundedCents: number;
}): number {
  const granted = Math.max(0, Math.floor(input.grantedTokens));
  if (granted === 0) return 0;
  const paid = Math.max(0, Math.floor(input.paidCents));
  const refunded = Math.max(0, Math.floor(input.refundedCents));
  if (paid === 0 || refunded === 0) return 0;
  if (refunded >= paid) return granted;
  return Math.min(granted, Math.floor((granted * refunded) / paid));
}

/** Noch zu entziehende Tokens aus kumulierter Erstattung. */
export function computeRefundDelta(input: {
  grantedTokens: number;
  paidCents: number;
  refundedCents: number;
  alreadyRefundedTokens: number;
  availableBalance: number | null;
}): { delta: number; target: number; already: number; cappedByBalance: boolean } {
  const target = computeRefundTokens(input);
  const already = Math.max(0, Math.floor(input.alreadyRefundedTokens));
  const open = Math.max(0, target - already);
  if (open === 0) return { delta: 0, target, already, cappedByBalance: false };
  if (input.availableBalance === null) return { delta: open, target, already, cappedByBalance: false };
  const available = Math.max(0, Math.floor(input.availableBalance));
  const delta = Math.min(open, available);
  return { delta, target, already, cappedByBalance: delta < open };
}

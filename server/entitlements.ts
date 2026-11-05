/**
 * Berechtigungen in der Datenbank verankern: Checkout → Gutschrift/Plan,
 * und die Anzeige-Sicht je Nutzer.
 *
 * Bewusst auf den vorhandenen Strukturen:
 *  - Guthaben: credit_ledger_entries (append-only, atomar, idempotent)
 *  - Plan: billingSubscriptions + resolvePlanForUser
 *  - Keine zweite Wahrheit, keine doppelte Tabelle.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import * as db from "./db";
import { grantCredits, readCreditBalance } from "./credit-ledger";
import { resolvePlanForUser } from "./monetization";
import {
  buildEntitlementView,
  decideCheckoutEntitlement,
  type CheckoutSummary,
  type EntitlementView,
} from "../lib/entitlement-logic";

const CHECKOUT_OPENID_CACHE_LIMIT = 500;
const openIdCache = new Map<number, string | null>();

/** Numerische Nutzer-ID → openId (Guthaben hängt an der openId). */
export async function openIdForUserId(userId: number): Promise<string | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (openIdCache.has(userId)) return openIdCache.get(userId) ?? null;
  const database = await getDb();
  if (!database) return null;
  try {
    const result = await database.execute(
      sql`SELECT "openId" AS open_id FROM "users" WHERE "id" = ${userId} LIMIT 1`,
    );
    const rows: Record<string, unknown>[] = Array.isArray(result)
      ? (result as Record<string, unknown>[])
      : (((result as { rows?: Record<string, unknown>[] }).rows) ?? []);
    const value = rows[0]?.open_id;
    const openId = typeof value === "string" && value.length > 0 ? value : null;
    if (openIdCache.size >= CHECKOUT_OPENID_CACHE_LIMIT) openIdCache.clear();
    openIdCache.set(userId, openId);
    return openId;
  } catch (error) {
    console.warn(
      "[entitlements] Nutzer nicht auflösbar:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export interface ProvisionResult {
  applied: boolean;
  kind: "credits" | "plan" | "none";
  reason: string;
  tokens?: number;
  plan?: string;
  idempotencyKey: string | null;
}

/**
 * Nach `checkout.session.completed`: Guthaben gutschreiben oder Plan bestätigen.
 * Idempotent über die Checkout-Session-ID; eine Wiederholung bucht nichts nach.
 */
export async function provisionCheckoutEntitlement(session: CheckoutSummary): Promise<ProvisionResult> {
  const decision = decideCheckoutEntitlement(session);
  if (decision.kind === "none") {
    return { applied: false, kind: "none", reason: decision.reason, idempotencyKey: decision.idempotencyKey };
  }

  const userId = session.userId ?? null;
  const openId = userId ? await openIdForUserId(userId) : null;
  if (!openId) {
    return {
      applied: false,
      kind: decision.kind,
      reason: "Kein Nutzer zum Checkout auflösbar — keine Buchung (wird erneut versucht).",
      idempotencyKey: decision.idempotencyKey,
    };
  }

  if (decision.kind === "credits" && decision.tokens) {
    const booked = await grantCredits({
      openId,
      tokens: decision.tokens,
      reason: `Stripe-Checkout ${session.id ?? ""}`.trim(),
      executionKey: decision.idempotencyKey ?? `stripe_checkout:${session.id}`,
    });
    return {
      applied: booked,
      kind: "credits",
      reason: booked ? decision.reason : "Gutschrift nicht gebucht (Datenbank nicht verfügbar oder bereits gebucht).",
      tokens: decision.tokens,
      idempotencyKey: decision.idempotencyKey,
    };
  }

  // Plan: die Wahrheit steht im Abo (billingSubscriptions). Hier nur die
  // Bestätigung, dass der Checkout zum gewünschten Plan gehört.
  return {
    applied: true,
    kind: "plan",
    reason: decision.reason,
    plan: decision.plan,
    idempotencyKey: decision.idempotencyKey,
  };
}

/** Anzeige-Sicht für /api/v1/entitlements. */
export async function readEntitlements(input: {
  userId: number;
  openId: string;
  isAdmin?: boolean;
}): Promise<{ available: boolean; view: EntitlementView | null }> {
  try {
    const [plan, subscription, balance] = await Promise.all([
      resolvePlanForUser(input.userId),
      db.getBillingSubscriptionForUser(input.userId),
      readCreditBalance(input.openId),
    ]);
    return {
      available: true,
      view: buildEntitlementView({
        plan,
        subscription: subscription
          ? {
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
        creditsBalanceTokens: balance,
        adminGuaranteed: input.isAdmin,
      }),
    };
  } catch (error) {
    console.warn(
      "[entitlements] Sicht nicht lesbar:",
      error instanceof Error ? error.message : String(error),
    );
    return { available: false, view: null };
  }
}

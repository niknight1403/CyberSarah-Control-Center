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
import { getUserTotalCredits, grantCreditsDetailed } from "./credit-ledger";
import { resolvePlanForUser } from "./monetization";
import {
  buildEntitlementView,
  decideCheckoutEntitlement,
  type CheckoutSummary,
  type EntitlementView,
} from "../lib/entitlement-logic";

/** Numerische Nutzer-ID → openId (Guthaben hängt an der openId). */
export async function openIdForUserId(userId: number): Promise<string | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
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
    return openId;
  } catch (error) {
    console.warn(
      "[entitlements] Nutzer nicht auflösbar:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Checkout kann die openId (String) oder die numerische Nutzer-ID tragen.
 * Beides wird akzeptiert, damit ein Checkout-Link nicht davon abhängt, welches
 * Format der Ersteller gewählt hat.
 */
export interface EntitlementDeps {
  openIdForUserId?: (userId: number) => Promise<string | null>;
  grantCredits?: (input: {
    openId: string;
    tokens: number;
    reason: string;
    executionKey: string;
    paymentIntent?: string | null;
  }) => Promise<{ booked: boolean; duplicate: boolean }>;
}

export async function resolveCheckoutOwner(
  session: CheckoutSummary,
  deps: EntitlementDeps = {},
): Promise<{
  userId: number | null;
  openId: string | null;
}> {
  const resolve = deps.openIdForUserId ?? openIdForUserId;
  const reference = String(session.clientReferenceId ?? "").trim();
  const metadataOpenId = String(session.metadata?.userOpenId ?? session.metadata?.openId ?? "").trim();
  if (metadataOpenId) return { userId: session.userId ?? null, openId: metadataOpenId };
  if (reference) {
    if (/^\d+$/.test(reference)) {
      const userId = Number(reference);
      return { userId, openId: await resolve(userId) };
    }
    return { userId: null, openId: reference };
  }
  const userId = session.userId ?? null;
  return { userId, openId: userId ? await resolve(userId) : null };
}

export interface ProvisionResult {
  applied: boolean;
  /** Wahr, wenn ein erneuter Zustellversuch die Buchung nachholen kann. */
  retryable?: boolean;
  /** Wahr, wenn die Buchung bereits vorhanden war (Doppelzustellung). */
  duplicate?: boolean;
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
export async function provisionCheckoutEntitlement(
  session: CheckoutSummary,
  deps: EntitlementDeps = {},
): Promise<ProvisionResult> {
  const decision = decideCheckoutEntitlement(session);
  if (decision.kind === "none") {
    return { applied: false, kind: "none", reason: decision.reason, idempotencyKey: decision.idempotencyKey };
  }

  const owner = await resolveCheckoutOwner(session, deps);
  const openId = owner.openId;
  if (!openId) {
    return {
      applied: false,
      kind: decision.kind,
      reason: "Kein Nutzer zum Checkout auflösbar — keine Buchung (wird erneut versucht).",
      idempotencyKey: decision.idempotencyKey,
    };
  }

  if (decision.kind === "credits" && decision.tokens) {
    const book = deps.grantCredits ?? grantCreditsDetailed;
    try {
      const result = await book({
        openId,
        tokens: decision.tokens,
        reason: `Stripe-Checkout ${session.id ?? ""}`.trim(),
        executionKey: `stripe_payment:${session.id}`,
        paymentIntent: session.paymentIntent ?? null,
      });
      if (result.booked) {
        return {
          applied: true,
          duplicate: false,
          kind: "credits",
          reason: decision.reason,
          tokens: decision.tokens,
          idempotencyKey: decision.idempotencyKey,
        };
      }
      if (result.duplicate) {
        return {
          applied: true,
          duplicate: true,
          kind: "credits",
          reason: "Bereits gebucht — Doppelzustellung ohne zweite Gutschrift.",
          tokens: decision.tokens,
          idempotencyKey: decision.idempotencyKey,
        };
      }
      return {
        applied: false,
        kind: "credits",
        reason: "Gutschrift nicht gebucht.",
        idempotencyKey: decision.idempotencyKey,
      };
    } catch (error) {
      return {
        applied: false,
        retryable: true,
        kind: "credits",
        reason: `Gutschrift fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        idempotencyKey: decision.idempotencyKey,
      };
    }
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
      getUserTotalCredits(input.openId),
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

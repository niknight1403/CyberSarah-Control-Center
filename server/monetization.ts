/**
 * Monetarisierungs-Server-Adapter (Sprint 124).
 *
 * Persistente, nutzerbezogene Quota-Zahlen (Neon-PostgreSQL via generische
 * KV-Tabelle — kein Schema-Migrationaufwand, identisches Muster wie der
 * Orchestrator-State-Store). Bietet Echtzeit-Tracking und Limitierung:
 *
 *   - enforceCloudQuotaForUser: Pruefung VOR verwalteten Cloud-Aufrufen.
 *     Rollout-Sicherheit: ENV QUOTA_ENFORCEMENT="monitor" (Standard) warnt
 *     nur, "enforce" blockiert aktiv. So wird nichts kaputtgerollt, bis der
 *     Admin den Enforcement-Modus bewusst aktiviert.
 *   - recordCloudTokenUsage: Verbuchung NACH dem Aufruf (echte Token-Zahl).
 *   - Plan-Loesung ueber die bestehende Billing-Subscription (lite/pro/expert),
 *     ohne Abo = "free".
 */

import * as db from "./db";
import { readSubscriptionLifecycle } from "../lib/subscription-lifecycle-logic";
import {
  checkQuota,
  consumeQuota,
  ensureAdminElitePlan,
  freshAccountState,
  rollPeriods,
  planForBillingPrice,
  type MonetizationAccountState,
  type QuotaCheck,
} from "../lib/monetization-logic";

const KEY_PREFIX = "monetization.account.";
const ENFORCEMENT_MODE = () => (process.env.QUOTA_ENFORCEMENT === "enforce" ? "enforce" : "monitor");

function accountKey(openId: string): string {
  return `${KEY_PREFIX}${openId}`;
}

/** Account-State laden (auto-initialisiert, nie null). */
export async function getMonetizationAccount(
  openId: string,
  options?: { isAdmin?: boolean; userId?: number },
): Promise<MonetizationAccountState> {
  let state: MonetizationAccountState;
  {
    const stored = await db.getModelRouterSetting<MonetizationAccountState>(accountKey(openId));
    if (stored && typeof stored === "object" && stored.plan) {
      state = rollPeriods(stored);
    } else {
      state = freshAccountState();
    }
  }
  // Paid-Entitlements werden bei jedem authentifizierten Zugriff aus dem aktuellen Billing-Lifecycle synchronisiert.
  if (options?.userId !== undefined) {
    const plan = await resolvePlanForUser(options.userId);
    if (state.plan !== plan) {
      state = { ...state, plan, updatedAt: new Date().toISOString() };
      await saveMonetizationAccount(openId, state);
    }
  }
  // Sprint 144 — Dauerhafte Admin-Elite-Garantie: Admin-Konten haben
  // immer das Expert-Paket mit unbegrenzter Quota (einmalig persistiert).
  if (options?.isAdmin === true) {
    const elite = ensureAdminElitePlan(state);
    if (elite !== state) {
      await saveMonetizationAccount(openId, elite);
    }
    return elite;
  }
  return state;
}

async function saveMonetizationAccount(openId: string, state: MonetizationAccountState): Promise<void> {
  await db.setModelRouterSetting(accountKey(openId), state);
}

/**
 * Plan anhand der bestehenden Billing-Subscription loesen (lite/pro/expert),
 * sonst "free". Kanal-agnostisch: Stripe-Checkout und Google-Play-Billing
 * schreiben beide in billingSubscriptions.
 */
export async function resolvePlanForUser(userId: number): Promise<"free" | "lite" | "pro" | "expert"> {
    const subscription = await db.getBillingSubscriptionForUser(userId);
    // Sprint 26: Zugriff entscheidet die Lebenszyklus-Lesart, nicht nur
    // "status === active". Ein zum Periodenende gekuendigtes Abo behaelt
    // seinen Zugriff bis zum Ende; past_due erhaelt eine Kulanzfrist.
    const lifecycle = subscription
      ? readSubscriptionLifecycle({
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodEnd: subscription.currentPeriodEnd,
          pausedBehavior: (subscription as { pausedBehavior?: string | null }).pausedBehavior ?? null,
        })
      : null;
    if (subscription && lifecycle?.entitled && subscription.stripePriceId) {
      // Tier aus dem konfigurierten Preis-Env loesen (kanal-agnostisch:
      // Stripe-Checkout und Google-Play-Billing schreiben beide nur die
      // stripePriceId des gebuchten Preises).
      return planForBillingPrice(subscription.stripePriceId, {
        expert: process.env.STRIPE_PRICE_ID_EXPERT,
        pro: process.env.STRIPE_PRICE_ID_PRO,
        lite: process.env.STRIPE_PRICE_ID_LITE,
      });
    }
  return "free";
}

export interface QuotaDecision extends QuotaCheck {
  /** Aktueller Enforcement-Modus ("monitor" warnt nur, "enforce" blockiert). */
  enforcement: "monitor" | "enforce";
}

/**
 * Echtzeit-Quota-Pruefung vor verwalteten Cloud-Aufrufen.
 * Im Monitor-Modus wird nur geloggt und erlaubt — aktives Blockieren
 * passiert erst, nachdem QUOTA_ENFORCEMENT=enforce gesetzt wurde.
 */
export async function enforceCloudQuotaForUser(
  user: { id: number; openId: string; role?: string },
  estimatedTokens: number,
): Promise<QuotaDecision> {
  const account = await getMonetizationAccount(user.openId, { isAdmin: user.role === "admin", userId: user.id });
  const decision = checkQuota(account, Math.max(1, Math.ceil(estimatedTokens)));
  const enforcement = ENFORCEMENT_MODE();

  if (!decision.allowed) {
    if (enforcement === "monitor") {
      console.warn(
        `[monetization] QUOTA (monitor-only) Nutzer ${user.openId.slice(0, 12)}…: ${decision.reason}`,
      );
      return { ...decision, allowed: true, enforcement };
    }
    console.warn(`[monetization] QUOTA BLOCKED Nutzer ${user.openId.slice(0, 12)}…: ${decision.reason}`);
    return { ...decision, enforcement };
  }
  return { ...decision, enforcement };
}

/** Tatsaechlichen Cloud-Token-Verbrauch verbuchen (nach dem Aufruf). */
export async function recordCloudTokenUsage(
  openId: string,
  actualTokens: number,
  options?: { isAdmin?: boolean; userId?: number },
): Promise<MonetizationAccountState> {
  await getMonetizationAccount(openId, options);
  return db.updateModelRouterSettingAtomic<MonetizationAccountState>(accountKey(openId), (stored) => {
    const account = stored && typeof stored === "object" && stored.plan ? rollPeriods(stored) : freshAccountState();
    const prepared = options?.isAdmin ? ensureAdminElitePlan(account) : account;
    return consumeQuota(prepared, Math.max(0, Math.ceil(actualTokens)));
  });
}

/** Guthaben eines Credit-Packs gutschreiben (nach validiertem Play-Kauf). */
export async function grantCreditPack(openId: string, packId: string): Promise<boolean> {
  await getMonetizationAccount(openId);
  const { applyCreditPack } = await import("../lib/monetization-logic");
  const current = await getMonetizationAccount(openId);
  if (!applyCreditPack(current, packId)) return false;
  await db.updateModelRouterSettingAtomic<MonetizationAccountState>(accountKey(openId), (stored) => {
    const account = stored && stored.plan ? stored : freshAccountState();
    const updated = applyCreditPack(account, packId);
    if (!updated) throw new Error("Unbekanntes Credit-Pack.");
    return updated;
  });
  return true;
}

/**
 * Revenue-KPI-Service fuers Command Dashboard.
 *
 * Zwei unabhaengige, ehrliche Quellen:
 *  1. Stripe (nur lesend): aktive und zahlungsverzoegerte Abos inkl. Preis.
 *     Key-Rotation wie im Data-Hub: der erste Key, der lesen darf, gewinnt.
 *  2. Eigene Datenbank: belegte Verkaeufe der letzten 30 Tage
 *     (`revenue_daily_stats`, `conversion_events`) und aktive Abo-Kunden
 *     (`billingSubscriptions`).
 *
 * Faellt eine Quelle aus, bleibt sie `null` — die Logik in
 * `lib/revenue-kpi-logic.ts` macht daraus eine sichtbare Luecke statt einer
 * erfundenen Zahl. Es werden keine Secrets geloggt.
 */
import Stripe from "stripe";
import { gte, inArray, sql } from "drizzle-orm";

import { getDb } from "./db";
import { billingSubscriptions, conversionEvents, revenueDailyStats } from "../drizzle/schema";
import {
  computeRevenueKpis,
  type RevenueKpiSnapshot,
  type RevenueSubscriptionLike,
} from "../lib/revenue-kpi-logic";

const WINDOW_DAYS = 30;

/** Stripe-Clients nach Modus filtern (live/test) — gleiche Regel wie im Data-Hub. */
function stripeClients(): Stripe[] {
  const mode = (process.env.STRIPE_MODE ?? "live").trim().toLowerCase();
  const keys = [process.env.STRIPE_SECRET_KEY, process.env.STRIPE_SECRET_KEY_2]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const accepted = keys.filter((key) =>
    mode === "test"
      ? key.startsWith("sk_test_") || key.startsWith("rk_test_")
      : key.startsWith("sk_live_") || key.startsWith("rk_live_"),
  );
  return [...new Set(accepted)].map((key) => new Stripe(key, { timeout: 8_000, maxNetworkRetries: 1 }));
}

type StripeSubscriptionItemLike = {
  quantity?: number | null;
  price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null;
};

/** Stripe-Abo auf die reine Kennzahlen-Form abbilden (keine Kunden-, keine Zahlungsdaten). */
export function mapStripeSubscription(subscription: {
  status?: string | null;
  items?: { data?: StripeSubscriptionItemLike[] } | null;
}): RevenueSubscriptionLike {
  const items = subscription.items?.data ?? [];
  let amountCents: number | null = null;
  let interval: "month" | "year" | null = null;
  let quantity: number | null = null;
  // Mehrere Positionen: Summe der bekannten Preise, unbekannte Position macht den
  // Gesamtpreis unbekannt (kein Teilwert, der den MRR zu niedrig aussehen liesse).
  let complete = items.length > 0;
  let sumCents = 0;
  let sumQuantity = 0;
  for (const item of items) {
    const unit = item.price?.unit_amount;
    const rawInterval = item.price?.recurring?.interval;
    const itemQuantity = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    if (typeof unit !== "number" || (rawInterval !== "month" && rawInterval !== "year")) {
      complete = false;
      continue;
    }
    sumCents += unit * itemQuantity;
    sumQuantity += itemQuantity;
    interval = interval ?? rawInterval;
  }
  if (complete) {
    amountCents = sumCents;
    quantity = sumQuantity;
  }
  return {
    status: (subscription.status ?? "").toLowerCase() || "unknown",
    amountCents,
    interval,
    quantity,
  };
}

async function loadStripeSubscriptions(): Promise<{ subscriptions: RevenueSubscriptionLike[] | null; gap?: string }> {
  const clients = stripeClients();
  if (clients.length === 0) {
    return { subscriptions: null, gap: "Kein Stripe-Key hinterlegt: wiederkehrender Umsatz nicht ermittelbar." };
  }
  let lastError = "";
  for (const stripe of clients) {
    try {
      const [active, pastDue, trialing] = await Promise.all([
        stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] }),
        stripe.subscriptions.list({ status: "past_due", limit: 100, expand: ["data.items.data.price"] }),
        stripe.subscriptions.list({ status: "trialing", limit: 100, expand: ["data.items.data.price"] }),
      ]);
      const all = [...active.data, ...trialing.data, ...pastDue.data];
      return { subscriptions: all.map((entry) => mapStripeSubscription(entry)) };
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 200) : "Stripe-Lesefehler.";
    }
  }
  console.warn("[RevenueKpi] Stripe-Abos nicht lesbar; Kennzahlen bleiben leer.", lastError);
  return { subscriptions: null, gap: "Stripe-Abos sind derzeit nicht lesbar: wiederkehrender Umsatz bleibt leer." };
}

function sinceDay(days: number): string {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

type LedgerMetrics = {
  revenue30dCents: number | null;
  paidOrders30d: number | null;
  activeCustomers: number | null;
  gaps: string[];
};

async function loadLedgerMetrics(): Promise<LedgerMetrics> {
  const gaps: string[] = [];
  const db = await getDb();
  if (!db) {
    return {
      revenue30dCents: null,
      paidOrders30d: null,
      activeCustomers: null,
      gaps: ["Datenbank nicht erreichbar: Umsatz- und Kundenkennzahlen bleiben leer."],
    };
  }

  let revenue30dCents: number | null = null;
  let paidOrders30d: number | null = null;
  let activeCustomers: number | null = null;

  try {
    const since = sinceDay(WINDOW_DAYS);
    const [daily] = await db
      .select({
        revenue: sql<string>`coalesce(sum(${revenueDailyStats.revenueCents}), 0)`,
        conversions: sql<string>`coalesce(sum(${revenueDailyStats.conversions}), 0)`,
      })
      .from(revenueDailyStats)
      .where(gte(revenueDailyStats.day, since));
    revenue30dCents = Number(daily?.revenue ?? 0) || 0;
    paidOrders30d = Number(daily?.conversions ?? 0) || 0;

    // Belegte Bestellungen aus dem Conversion-Log erweitern das Fenster:
    // die Tagesstatistik kann hinterherhinken, echte Buchungen zaehlen sofort.
    const sinceDate = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [orders] = await db
      .select({
        amount: sql<string>`coalesce(sum(${conversionEvents.amountCents}), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(conversionEvents)
      .where(gte(conversionEvents.occurredAt, sinceDate));
    const orderRevenue = Number(orders?.amount ?? 0) || 0;
    const orderCount = Number(orders?.count ?? 0) || 0;
    revenue30dCents += orderRevenue;
    paidOrders30d += orderCount;
  } catch (error) {
    console.warn("[RevenueKpi] Verkaufs-Ledger nicht lesbar.", error instanceof Error ? error.message.slice(0, 160) : "unbekannt");
    gaps.push("Verkaufs-Ledger nicht lesbar: Umsatzkennzahlen bleiben leer.");
    revenue30dCents = null;
    paidOrders30d = null;
  }

  try {
    const rows = await db
      .select({ count: sql<string>`count(*)` })
      .from(billingSubscriptions)
      .where(inArray(billingSubscriptions.status, ["active", "trialing", "past_due"]));
    activeCustomers = Number(rows[0]?.count ?? 0) || 0;
  } catch (error) {
    console.warn("[RevenueKpi] Abo-Kunden nicht lesbar.", error instanceof Error ? error.message.slice(0, 160) : "unbekannt");
    gaps.push("Kundenstand nicht lesbar: Zahl aktiver Abo-Kunden bleibt leer.");
  }

  return { revenue30dCents, paidOrders30d, activeCustomers, gaps };
}

/** Vollstaendiger KPI-Satz fuers Dashboard; jede Quelle scheitert unabhaengig. */
export async function loadRevenueKpis(): Promise<RevenueKpiSnapshot> {
  const [stripeResult, ledger] = await Promise.all([loadStripeSubscriptions(), loadLedgerMetrics()]);
  return computeRevenueKpis({
    subscriptions: stripeResult.subscriptions,
    revenue30dCents: ledger.revenue30dCents,
    paidOrders30d: ledger.paidOrders30d,
    activeCustomers: ledger.activeCustomers,
    gaps: [...(stripeResult.gap ? [stripeResult.gap] : []), ...ledger.gaps],
  });
}

/** Nur fuer Tests: die reine Service-Abbildung ohne Netzwerk. */
export const __test = { mapStripeSubscription, sinceDay };

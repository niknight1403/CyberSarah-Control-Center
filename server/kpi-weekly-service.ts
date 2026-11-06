/**
 * Wochenauswertung der vier Kern-KPIs.
 *
 * Liest aus zwei Quellen und erfindet nichts dazu:
 * - `conversion_events`: gestartete und abgeschlossene Checkouts
 * - `revenue_jobs`: Erstgespraech-Anfragen und gefuehrte Gespraeche
 *
 * Fehlt eine Tabelle, wird das im Ergebnis als Warnung ausgewiesen, statt eine
 * Null zu liefern, die wie "keine Verkaeufe" aussieht.
 */
import { and, eq, gte, inArray } from "drizzle-orm";

import { conversionEvents, revenueJobs } from "../drizzle/schema";
import { AI_INFLUENZA_INTRO_JOB_KIND } from "./ai-influenza-intro-request-service";
import { getDb } from "./db";
import {
  KPI_DEFINITIONS,
  aggregateWeekly,
  funnelRates,
  isoWeekStart,
  sumKpis,
  weeklyAverage,
  type KpiEvent,
  type KpiId,
} from "../lib/kpi-weekly-logic";
import { forecast, type ForecastResult } from "../lib/revenue-forecast-logic";

export type WeeklyKpiReport = {
  generatedAt: string;
  weeks: number;
  definitions: typeof KPI_DEFINITIONS;
  buckets: ReturnType<typeof aggregateWeekly>;
  totals: Record<KpiId, number>;
  averagePerActiveWeek: Record<KpiId, number>;
  rates: ReturnType<typeof funnelRates>;
  paidCustomers: number;
  revenueCents: number;
  warnings: string[];
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function weeklyKpiReport(input: { weeks?: number; now?: Date } = {}): Promise<WeeklyKpiReport> {
  const weeks = Math.min(52, Math.max(1, input.weeks ?? 8));
  const now = input.now ?? new Date();
  const since = new Date(isoWeekStart(now).getTime() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000);
  const warnings: string[] = [];
  const events: KpiEvent[] = [];
  let paidCustomers = 0;

  const db = await getDb();
  if (!db) {
    return {
      generatedAt: now.toISOString(),
      weeks,
      definitions: KPI_DEFINITIONS,
      buckets: aggregateWeekly([], now, weeks),
      totals: { checkouts_started: 0, checkouts_completed: 0, intro_requests: 0, intro_calls_held: 0 },
      averagePerActiveWeek: { checkouts_started: 0, checkouts_completed: 0, intro_requests: 0, intro_calls_held: 0 },
      rates: { checkoutToPaid: null, requestToCall: null, callToPaid: null },
      paidCustomers: 0,
      revenueCents: 0,
      warnings: ["Datenbank nicht verfügbar — keine Auswertung möglich."],
    };
  }

  // Checkout-Ereignisse
  try {
    const rows = await db
      .select({
        eventType: conversionEvents.eventType,
        occurredAt: conversionEvents.occurredAt,
        amountCents: conversionEvents.amountCents,
        orderKey: conversionEvents.orderKey,
      })
      .from(conversionEvents)
      .where(
        and(
          inArray(conversionEvents.eventType, ["checkout_started", "checkout_completed"]),
          gte(conversionEvents.occurredAt, since),
        ),
      );
    for (const row of rows) {
      const occurredAt = asDate(row.occurredAt);
      if (!occurredAt) continue;
      const kpi: KpiId = row.eventType === "checkout_completed" ? "checkouts_completed" : "checkouts_started";
      events.push({ kpi, occurredAt, amountCents: row.amountCents ?? 0, reference: row.orderKey });
      if (kpi === "checkouts_completed") paidCustomers += 1;
    }
  } catch (error) {
    warnings.push(
      `conversion_events nicht lesbar (${error instanceof Error ? error.message : String(error)}) — Checkout-KPIs fehlen. Migration 0013 pruefen.`,
    );
  }

  // Anfragen und gefuehrte Gespraeche
  let conversationHeldFromCalls = 0;
  try {
    const rows = await db
      .select({ payload: revenueJobs.payload, createdAt: revenueJobs.createdAt, status: revenueJobs.status })
      .from(revenueJobs)
      .where(and(eq(revenueJobs.kind, AI_INFLUENZA_INTRO_JOB_KIND), gte(revenueJobs.createdAt, since)));
    for (const row of rows) {
      const occurredAt = asDate(row.createdAt);
      if (!occurredAt) continue;
      events.push({ kpi: "intro_requests", occurredAt });
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const heldAt = asDate(payload.conversationHeldAt);
      if (heldAt) {
        events.push({ kpi: "intro_calls_held", occurredAt: heldAt });
        if (payload.convertedToPaid === true) conversationHeldFromCalls += 1;
      }
    }
  } catch (error) {
    warnings.push(
      `revenue_jobs nicht lesbar (${error instanceof Error ? error.message : String(error)}) — Anfrage-KPIs fehlen. Migration 0016 pruefen.`,
    );
  }

  const buckets = aggregateWeekly(events, now, weeks);
  const totals = sumKpis(buckets);
  const rates = funnelRates(totals, conversationHeldFromCalls);
  const revenueCents = buckets.reduce((sum, bucket) => sum + bucket.revenueCents, 0);

  if (totals.checkouts_started > 0 && totals.checkouts_completed === 0) {
    warnings.push(
      `${totals.checkouts_started} gestartete Checkouts ohne Abschluss. Der Checkout ist der Engpass, nicht der Traffic.`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    weeks,
    definitions: KPI_DEFINITIONS,
    buckets,
    totals,
    averagePerActiveWeek: weeklyAverage(buckets),
    rates,
    paidCustomers,
    revenueCents,
    warnings,
  };
}

/** Prognose auf Basis der Wochenauswertung. */
export async function kpiForecast(input: { weeks?: number; now?: Date } = {}): Promise<{
  report: WeeklyKpiReport;
  forecast: ForecastResult;
}> {
  const report = await weeklyKpiReport(input);
  return {
    report,
    forecast: forecast({
      totals: report.totals,
      measured: report.rates,
      paidCustomers: report.paidCustomers,
      paidFromCalls: null,
    }),
  };
}

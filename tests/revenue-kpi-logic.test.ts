/**
 * Tests fuer die Revenue-KPI-Logik (Command Dashboard).
 * Kernaussage: nichts wird geschaetzt — fehlende Quellen ergeben `null`
 * plus einen benannten Grund.
 */
import { describe, expect, it } from "vitest";

import {
  averageOrderCents,
  computeRecurringRevenue,
  computeRevenueKpis,
  formatCount,
  formatEuroCents,
  isMrrEligible,
  normalizeMonthlyCents,
  sourceLabel,
  type RevenueSubscriptionLike,
} from "@/lib/revenue-kpi-logic";

const sub = (over: Partial<RevenueSubscriptionLike> = {}): RevenueSubscriptionLike => ({
  status: "active",
  amountCents: 4900,
  interval: "month",
  quantity: 1,
  ...over,
});

describe("normalizeMonthlyCents", () => {
  it("nimmt Monatspreise unveraendert", () => {
    expect(normalizeMonthlyCents(sub({ amountCents: 4900, interval: "month" }))).toBe(4900);
  });

  it("teilt Jahrespreise auf Monate", () => {
    expect(normalizeMonthlyCents(sub({ amountCents: 58800, interval: "year" }))).toBe(4900);
  });

  it("rechnet Mengen ein", () => {
    expect(normalizeMonthlyCents(sub({ amountCents: 1000, quantity: 3 }))).toBe(3000);
  });

  it("liefert null bei unbekanntem Preis oder Intervall", () => {
    expect(normalizeMonthlyCents(sub({ amountCents: null }))).toBeNull();
    expect(normalizeMonthlyCents(sub({ interval: null }))).toBeNull();
  });
});

describe("computeRecurringRevenue", () => {
  it("zaehlt nur aktive und testende Abos", () => {
    const result = computeRecurringRevenue([
      sub({ status: "active", amountCents: 4900 }),
      sub({ status: "trialing", amountCents: 9900 }),
      sub({ status: "canceled", amountCents: 20000 }),
      sub({ status: "unpaid", amountCents: 20000 }),
    ]);
    expect(result).toEqual({ mrrCents: 14800, activeSubscriptions: 2, pastDueSubscriptions: 0, unknownPriceSubscriptions: 0 });
  });

  it("weist past_due separat aus, ohne ihn in den MRR zu rechnen", () => {
    const result = computeRecurringRevenue([sub({ status: "active" }), sub({ status: "past_due", amountCents: 10000 })]);
    expect(result.mrrCents).toBe(4900);
    expect(result.pastDueSubscriptions).toBe(1);
  });

  it("zaehlt Abos ohne Preis, schaetzt sie aber nicht", () => {
    const result = computeRecurringRevenue([sub({ amountCents: 4900 }), sub({ amountCents: null })]);
    expect(result.mrrCents).toBe(4900);
    expect(result.unknownPriceSubscriptions).toBe(1);
    expect(result.activeSubscriptions).toBe(2);
  });

  it("erkennt Status unabhaengig von Gross-/Kleinschreibung und Leerzeichen", () => {
    expect(isMrrEligible(sub({ status: " ACTIVE " }))).toBe(true);
    expect(isMrrEligible(sub({ status: "past_due" }))).toBe(false);
  });
});

describe("averageOrderCents", () => {
  it("rundet kaufmaennisch auf Cent", () => {
    expect(averageOrderCents(10_000, 3)).toBe(3333);
  });

  it("liefert null ohne Bestellungen (0 waere falsch)", () => {
    expect(averageOrderCents(0, 0)).toBeNull();
    expect(averageOrderCents(null, 5)).toBeNull();
    expect(averageOrderCents(500, null)).toBeNull();
  });
});

describe("computeRevenueKpis", () => {
  const now = new Date("2026-11-09T04:00:00.000Z");

  it("kombiniert Stripe-Abos mit belegten Verkaeufen", () => {
    const snapshot = computeRevenueKpis({
      subscriptions: [sub({ amountCents: 4900 }), sub({ status: "past_due", amountCents: 9900 })],
      revenue30dCents: 25_000,
      paidOrders30d: 5,
      activeCustomers: 2,
      now,
    });
    expect(snapshot.mrrCents).toBe(4900);
    expect(snapshot.arrCents).toBe(58_800);
    expect(snapshot.revenue30dCents).toBe(25_000);
    expect(snapshot.paidOrders30d).toBe(5);
    expect(snapshot.averageOrderCents).toBe(5000);
    expect(snapshot.activeCustomers).toBe(2);
    expect(snapshot.pastDueSubscriptions).toBe(1);
    expect(snapshot.computedAt).toBe(now.toISOString());
    expect(snapshot.sources).toEqual({ mrr: "stripe", revenue30d: "ledger", customers: "ledger" });
    expect(snapshot.gaps).toEqual([]);
  });

  it("bleibt ehrlich leer, wenn keine Quelle erreichbar ist", () => {
    const snapshot = computeRevenueKpis({
      subscriptions: null,
      revenue30dCents: null,
      paidOrders30d: null,
      activeCustomers: null,
      now,
    });
    expect(snapshot.mrrCents).toBeNull();
    expect(snapshot.arrCents).toBeNull();
    expect(snapshot.revenue30dCents).toBeNull();
    expect(snapshot.averageOrderCents).toBeNull();
    expect(snapshot.sources).toEqual({ mrr: "unavailable", revenue30d: "unavailable", customers: "unavailable" });
    expect(snapshot.gaps.length).toBe(3);
  });

  it("meldet Abos ohne Preis als Luecke, ohne den MRR zu verfaelschen", () => {
    const snapshot = computeRevenueKpis({
      subscriptions: [sub({ amountCents: 4900 }), sub({ amountCents: null })],
      revenue30dCents: 0,
      paidOrders30d: 0,
      activeCustomers: 0,
      now,
    });
    expect(snapshot.mrrCents).toBe(4900);
    expect(snapshot.unknownPriceSubscriptions).toBe(1);
    expect(snapshot.gaps[0]).toContain("ohne hinterlegten Preis");
  });

  it("uebernimmt zusaetzliche Gruende dedupliziert", () => {
    const snapshot = computeRevenueKpis({
      subscriptions: [],
      revenue30dCents: 0,
      paidOrders30d: 0,
      activeCustomers: 0,
      gaps: ["Datenbank nicht erreichbar.", "Datenbank nicht erreichbar.", " "],
      now,
    });
    expect(snapshot.gaps).toEqual(["Datenbank nicht erreichbar."]);
    expect(snapshot.mrrCents).toBe(0);
  });

  it("behandelt negative oder unsinnige Ledger-Werte als 0", () => {
    const snapshot = computeRevenueKpis({
      subscriptions: [],
      revenue30dCents: -500,
      paidOrders30d: -2,
      activeCustomers: -1,
      now,
    });
    expect(snapshot.revenue30dCents).toBe(0);
    expect(snapshot.paidOrders30d).toBe(0);
    expect(snapshot.activeCustomers).toBe(0);
  });
});

describe("Formatierung", () => {
  it("formatiert Euro mit Tausenderpunkt und Komma", () => {
    expect(formatEuroCents(123_456)).toBe("1.234,56 €");
    expect(formatEuroCents(0)).toBe("0,00 €");
    expect(formatEuroCents(null)).toBe("—");
  });

  it("formatiert Zaehler und Quelle", () => {
    expect(formatCount(12)).toBe("12");
    expect(formatCount(null)).toBe("—");
    const snapshot = computeRevenueKpis({
      subscriptions: [sub()],
      revenue30dCents: 100,
      paidOrders30d: 1,
      activeCustomers: 1,
      now: new Date("2026-11-09T04:00:00.000Z"),
    });
    expect(sourceLabel(snapshot)).toBe("MRR: Stripe · Umsatz: eigene Buchungen · Kunden: Datenbank");
  });
});

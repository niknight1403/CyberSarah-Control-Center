import { describe, expect, it } from "vitest";

import { aggregateWeekly, funnelRates, isoDate, isoWeekStart, sumKpis, weeklyAverage, type KpiEvent } from "../lib/kpi-weekly-logic";

// Freitag, 6. November 2026
const NOW = new Date("2026-11-06T22:00:00.000Z");

describe("isoWeekStart", () => {
  it("findet den Montag der Woche", () => {
    expect(isoDate(isoWeekStart(NOW))).toBe("2026-11-02");
    expect(isoDate(isoWeekStart(new Date("2026-11-02T00:00:00.000Z")))).toBe("2026-11-02");
  });

  it("behandelt Sonntag als Ende der Woche, nicht als Anfang", () => {
    expect(isoDate(isoWeekStart(new Date("2026-11-08T23:00:00.000Z")))).toBe("2026-11-02");
  });

  it("rechnet ueber Monatsgrenzen", () => {
    expect(isoDate(isoWeekStart(new Date("2026-11-01T10:00:00.000Z")))).toBe("2026-10-26");
  });
});

describe("aggregateWeekly", () => {
  const events: KpiEvent[] = [
    { kpi: "checkouts_started", occurredAt: new Date("2026-11-03T10:00:00.000Z") },
    { kpi: "checkouts_started", occurredAt: new Date("2026-11-04T10:00:00.000Z") },
    { kpi: "checkouts_completed", occurredAt: new Date("2026-11-04T11:00:00.000Z"), amountCents: 29900 },
    { kpi: "intro_requests", occurredAt: new Date("2026-10-28T09:00:00.000Z") },
    { kpi: "intro_calls_held", occurredAt: new Date("2026-10-29T15:00:00.000Z") },
  ];

  it("legt leere Wochen an, damit eine Flaute nicht wie ein Datenausfall aussieht", () => {
    const buckets = aggregateWeekly(events, NOW, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[0].weekStart).toBe("2026-10-12");
    expect(buckets[3].weekStart).toBe("2026-11-02");
    expect(buckets[0].events).toBe(0);
  });

  it("zaehlt Ereignisse in die richtige Woche", () => {
    const buckets = aggregateWeekly(events, NOW, 4);
    const letzte = buckets[3];
    expect(letzte.totals.checkouts_started).toBe(2);
    expect(letzte.totals.checkouts_completed).toBe(1);
    expect(letzte.revenueCents).toBe(29900);
    const vorwoche = buckets[2];
    expect(vorwoche.totals.intro_requests).toBe(1);
    expect(vorwoche.totals.intro_calls_held).toBe(1);
  });

  it("ignoriert Ereignisse ausserhalb des Fensters", () => {
    const alt: KpiEvent = { kpi: "intro_requests", occurredAt: new Date("2026-01-01T00:00:00.000Z") };
    const buckets = aggregateWeekly([...events, alt], NOW, 4);
    expect(sumKpis(buckets).intro_requests).toBe(1);
  });
});

describe("funnelRates", () => {
  it("rechnet echte Anteile", () => {
    const rates = funnelRates({ checkouts_started: 8, checkouts_completed: 2, intro_requests: 10, intro_calls_held: 4 }, 1);
    expect(rates.checkoutToPaid).toBe(0.25);
    expect(rates.requestToCall).toBe(0.4);
    expect(rates.callToPaid).toBe(0.25);
  });

  it("liefert null statt Division durch null", () => {
    const rates = funnelRates({ checkouts_started: 0, checkouts_completed: 0, intro_requests: 0, intro_calls_held: 0 });
    expect(rates.checkoutToPaid).toBeNull();
    expect(rates.requestToCall).toBeNull();
    expect(rates.callToPaid).toBeNull();
  });

  it("beschreibt eine echte Null als Null, nicht als fehlend", () => {
    const rates = funnelRates({ checkouts_started: 5, checkouts_completed: 0, intro_requests: 3, intro_calls_held: 0 });
    expect(rates.checkoutToPaid).toBe(0);
    expect(rates.requestToCall).toBe(0);
  });
});

describe("weeklyAverage", () => {
  it("teilt durch Wochen mit Aktivitaet, nicht durch alle Wochen", () => {
    const buckets = aggregateWeekly(
      [
        { kpi: "intro_requests", occurredAt: new Date("2026-11-03T10:00:00.000Z") },
        { kpi: "intro_requests", occurredAt: new Date("2026-11-04T10:00:00.000Z") },
      ],
      NOW,
      4,
    );
    const average = weeklyAverage(buckets);
    expect(average.intro_requests).toBe(2);
  });
});

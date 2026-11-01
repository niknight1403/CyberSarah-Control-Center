import { describe, expect, it } from "vitest";

import {
  buildMetricsSnapshot,
  computeConversionRate,
  computeMrr,
  computeSignupRate,
  countActiveApiCustomers,
  countActiveSubscriptions,
  formatCents,
  sumApiCalls,
} from "@/lib/revenue-metrics-logic";

const subs = [
  { customerId: "cus_1", status: "active" as const, amountCents: 4900, interval: "month" as const },
  { customerId: "cus_2", status: "active" as const, amountCents: 12000, interval: "year" as const },
  { customerId: "cus_3", status: "past_due" as const, amountCents: 9900, interval: "month" as const },
  { customerId: "cus_4", status: "canceled" as const, amountCents: 4900, interval: "month" as const },
];

describe("MRR", () => {
  it("rechnet Jahresabos auf Monatswerte um und ignoriert gekuendigte", () => {
    expect(computeMrr(subs)).toBe(4900 + 1000 + 9900);
  });

  it("zaehlt nur aktive und ueberfaellige Abos", () => {
    expect(countActiveSubscriptions(subs)).toBe(3);
  });

  it("behandelt leere Eingaben ohne Fehler", () => {
    expect(computeMrr([])).toBe(0);
  });
});

describe("Conversion", () => {
  it("berechnet Prozentwerte mit zwei Nachkommastellen", () => {
    expect(computeConversionRate({ visitors: 3000, signups: 240, paidCustomers: 45 })).toBe(1.5);
    expect(computeSignupRate({ visitors: 3000, signups: 240, paidCustomers: 45 })).toBe(8);
  });

  it("vermeidet Division durch null", () => {
    expect(computeConversionRate({ visitors: 0, signups: 0, paidCustomers: 0 })).toBe(0);
  });
});

describe("API-Nutzung", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const usage = [
    { customerId: "cus_1", calls: 100, occurredAt: "2026-10-31T10:00:00.000Z" },
    { customerId: "cus_1", calls: 50, occurredAt: "2026-10-20T10:00:00.000Z" },
    { customerId: "cus_2", calls: 10, occurredAt: "2026-09-01T10:00:00.000Z" },
    { customerId: "cus_3", calls: 0, occurredAt: "2026-10-30T10:00:00.000Z" },
  ];

  it("summiert nur das 30-Tage-Fenster", () => {
    expect(sumApiCalls(usage, now)).toBe(150);
  });

  it("zaehlt aktive Kunden ohne Nullnutzung", () => {
    expect(countActiveApiCustomers(usage, now)).toBe(1);
  });
});

describe("Snapshot", () => {
  it("liefert ARR, Conversion und Nutzung zusammen", () => {
    const snapshot = buildMetricsSnapshot({
      subscriptions: subs,
      funnel: { visitors: 3000, signups: 240, paidCustomers: 45 },
      usage: [{ customerId: "cus_1", calls: 42, occurredAt: "2026-10-31T10:00:00.000Z" }],
      now: new Date("2026-11-01T12:00:00.000Z"),
    });
    expect(snapshot.mrrCents).toBe(15800);
    expect(snapshot.arrCents).toBe(189600);
    expect(snapshot.conversionRate).toBe(1.5);
    expect(snapshot.apiCalls30d).toBe(42);
    expect(snapshot.computedAt).toBe("2026-11-01T12:00:00.000Z");
  });

  it("formatiert Betraege in Euro", () => {
    expect(formatCents(15800)).toBe("158,00 EUR");
  });
});

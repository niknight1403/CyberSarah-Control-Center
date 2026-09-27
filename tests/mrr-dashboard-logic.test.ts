import { describe, it, expect } from "vitest";
import {
  mrrEligible,
  computeMrrCents,
  computeChurnRate,
  countNewCustomers,
  buildPaymentTimeline,
  formatMrrLine,
} from "@/lib/mrr-dashboard-logic";
import type { SubscriptionRecordLike } from "@/lib/mrr-dashboard-logic";

const DAY = 86_400_000;
const sub = (over: Partial<SubscriptionRecordLike> = {}): SubscriptionRecordLike => ({
  id: "s1",
  tier: "pro",
  status: "active",
  startedAt: 0,
  canceledAt: null,
  ...over,
});

describe("Sprint 321 — MRR-Dashboard v2", () => {
  it("nur aktive/trialing Abos sind MRR-wuerdig", () => {
    const subs = [
      sub({ id: "a" }),
      sub({ id: "b", status: "past_due" }),
      sub({ id: "c", status: "canceled", canceledAt: DAY }),
      sub({ id: "d", status: "trialing" }),
      sub({ id: "e", canceledAt: 2 * DAY }),
    ];
    const ids = mrrEligible(subs, DAY).map((s) => s.id);
    expect(ids).toEqual(["a", "d", "e"]);
  });

  it("MRR zaehlt nur Katalog-preise; unbekannte bleiben draussen und werden gemeldet", () => {
    const subs = [sub({ tier: "pro" }), sub({ tier: "expert" })];
    const r = computeMrrCents(subs, { pro: 1500 }, DAY);
    expect(r.mrrCents).toBe(1500);
    expect(r.unknownTierCount).toBe(1);
    expect(formatMrrLine(r, "eur")).toContain("NICHT mitgezaehlt");

    const full = computeMrrCents(subs, { pro: 1500, expert: 4900 }, DAY);
    expect(full.mrrCents).toBe(6400);
    expect(formatMrrLine(full, "eur")).not.toContain("unbekannt");
  });

  it("Churn-Rate: gekuendete im Fenster / aktive am Start", () => {
    const subs = [
      sub({ id: "stay", startedAt: 0, canceledAt: null }),
      sub({ id: "churn", startedAt: 0, canceledAt: 5 * DAY }),
      sub({ id: "late", startedAt: 10 * DAY, canceledAt: 15 * DAY }),
    ];
    const window = { from: 3 * DAY, to: 10 * DAY };
    // aktive am Start: stay + churn (late startete noch nicht)
    expect(computeChurnRate(subs, window)).toBeCloseTo(0.5);
    expect(computeChurnRate([sub({ id: "stay" })], window)).toBe(0);
    expect(computeChurnRate([], window)).toBe(0);
  });

  it("Neukunden nur aus Starts im Fenster", () => {
    const subs = [
      sub({ id: "in", startedAt: 5 * DAY }),
      sub({ id: "out", startedAt: 0 }),
    ];
    expect(countNewCustomers(subs, { from: 3 * DAY, to: 10 * DAY })).toBe(1);
  });

  it("Zahlungsverlauf aggregiert pro Monat aufsteigend", () => {
    const mk = (iso: string) => Date.parse(iso);
    const payments = [
      { date: mk("2026-07-02"), amountCents: 1000 },
      { date: mk("2026-07-20"), amountCents: 500 },
      { date: mk("2026-08-01"), amountCents: 2000 },
      { date: mk("2025-01-01"), amountCents: 99999 }, // ausserhalb
    ];
    const t = buildPaymentTimeline(payments, { from: mk("2026-07-01"), to: mk("2026-08-31") });
    expect(t).toEqual([
      { month: "2026-07", amountCents: 1500 },
      { month: "2026-08", amountCents: 2000 },
    ]);
  });
});

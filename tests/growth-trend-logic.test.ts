import { describe, expect, it } from "vitest";
import { compareGrowthWindows } from "../lib/growth-trend-logic";
const metrics = (impressions: number, revenue: number, clicks = 10, purchases = 1) => ({
  impressions, clicks, purchases, confirmedRevenueCents: revenue,
});
describe("Sprint 08: source-consistent 7 versus previous 23-day trend", () => {
  it("uses equalised per-day baselines not misleading 7 vs 30-day totals", () => {
    const trend = compareGrowthWindows(metrics(700, 7000), metrics(3000, 30000));
    expect(trend.ready).toBe(true);
    expect(trend.recentImpressionsPerDay).toBe(100);
    expect(trend.priorImpressionsPerDay).toBe(100);
    expect(trend.reachDailyChangePct).toBe(0);
  });
  it("requires a real baseline before claiming percent growth", () => {
    const trend = compareGrowthWindows(metrics(140, 0), metrics(140, 0));
    expect(trend.reachDailyChangePct).toBeNull();
  });
  it("does not claim growth when snapshot is truncated or sources disagree", () => {
    expect(compareGrowthWindows(metrics(900, 0), metrics(800, 0)).ready).toBe(false);
    expect(compareGrowthWindows(metrics(700, 0), metrics(3000, 0), false).ready).toBe(false);
  });
  it("separates negative refund-adjusted revenue from positive reach", () => {
    const trend = compareGrowthWindows(metrics(700, -1400), metrics(3000, 7000));
    expect(trend.recentRevenuePerDayCents).toBe(-200);
  });
});

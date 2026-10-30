import type { GrowthMetrics } from "./always-on-growth-logic";
type WindowMetric = Pick<GrowthMetrics, "impressions" | "clicks" | "purchases" | "confirmedRevenueCents">;
export function compareGrowthWindows(last7: WindowMetric, last30: WindowMetric, complete = true) {
  const consistent = complete && [last7.impressions, last30.impressions, last7.clicks, last30.clicks,
    last7.purchases, last30.purchases].every(Number.isSafeInteger) &&
    last7.impressions >= 0 && last30.impressions >= last7.impressions &&
    last30.clicks >= last7.clicks && last30.purchases >= last7.purchases;
  const daily = (value: number, days: number) => Number((value / days).toFixed(2));
  if (!consistent) return {
    ready: false, reason: "Unvollstaendige/inkonsistente Datenfenster: Trend nicht belastbar",
    recentImpressionsPerDay: null, priorImpressionsPerDay: null,
    reachDailyChangePct: null, recentRevenuePerDayCents: null,
    priorRevenuePerDayCents: null,
  };
  const recent = daily(last7.impressions, 7), prior = daily(last30.impressions - last7.impressions, 23);
  const recentRevenue = daily(last7.confirmedRevenueCents, 7);
  const priorRevenue = daily(last30.confirmedRevenueCents - last7.confirmedRevenueCents, 23);
  return {
    ready: true, reason: "7 Tage gegenueber den 23 Tagen davor, jeweils Tagesdurchschnitt; keine Kausalitaet.",
    recentImpressionsPerDay: recent, priorImpressionsPerDay: prior,
    reachDailyChangePct: prior > 0 ? Number((100 * (recent - prior) / prior).toFixed(2)) : null,
    recentRevenuePerDayCents: recentRevenue, priorRevenuePerDayCents: priorRevenue,
  };
}

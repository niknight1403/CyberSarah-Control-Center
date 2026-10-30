/** Read platform insight aggregates defensively; do not sum malformed provider values. */
export type ReachInsights = Record<string, unknown>;
const safeCount = (value: unknown): number | null => {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
export function mergeChannelReach(
  eventImpressions: unknown, eventViews: unknown, insights: readonly ReachInsights[],
) {
  let discarded = 0;
  const sum = (keys: readonly string[]) => insights.reduce((total, row) => {
    for (const key of keys) {
      if (row[key] === undefined || row[key] === null) continue;
      const count = safeCount(row[key]);
      if (count !== null && Number.isSafeInteger(total + count)) return total + count;
      discarded++;
      return total;
    }
    return total;
  }, 0);
  const sourceImpressions = sum(["impressions", "reach"]);
  const sourceViews = sum(["views", "plays", "video_views"]);
  const countedImpressions = safeCount(eventImpressions);
  const countedViews = safeCount(eventViews);
  if (countedImpressions === null) discarded++;
  if (countedViews === null) discarded++;
  const impressions = Math.max(countedImpressions ?? 0, sourceImpressions);
  const views = Math.max(countedViews ?? 0, sourceViews);
  return {
    impressions, views,
    // Max of two overlapping sources is explicitly not their sum.
    impressionsSource: (sourceImpressions > (countedImpressions ?? 0) ? "platform" : "events") as "events" | "platform",
    viewsSource: (sourceViews > (countedViews ?? 0) ? "platform" : "events") as "events" | "platform",
    discardedValues: discarded,
    hasUnverifiedCrossSourceTotals: discarded > 0,
  };
}

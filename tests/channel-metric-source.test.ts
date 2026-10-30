import { describe, expect, it } from "vitest";
import { mergeChannelReach } from "../lib/channel-metric-source";
describe("Sprint 03: safe and provenance-aware platform reach", () => {
  it("avoids adding two overlapping views/impression sources together", () => {
    const result = mergeChannelReach(1000, 500, [
      { impressions: 600, views: 240 }, { impressions: 650, views: 300 },
    ]);
    expect(result).toMatchObject({ impressions: 1250, views: 540,
      impressionsSource: "platform", viewsSource: "platform" });
  });
  it("prefers event source if platform totals are lower", () => {
    const result = mergeChannelReach(2000, 900, [{ impressions: 150, plays: 100 }]);
    expect(result).toMatchObject({ impressions: 2000, views: 900,
      impressionsSource: "events", viewsSource: "events" });
  });
  it("ignores malformed negative and infinite provider values without NaN contamination", () => {
    const result = mergeChannelReach("100", "40", [
      { reach: "-5", plays: "Infinity" }, { reach: "not-a-number", plays: -2 },
    ]);
    expect(result).toMatchObject({ impressions: 100, views: 40, discardedValues: 4 });
  });
  it("accepts valid zero while preferring one available provider key", () => {
    const result = mergeChannelReach(0, 0, [{ impressions: 0, reach: 1000, video_views: 40 }]);
    expect(result.impressions).toBe(0);
    expect(result.views).toBe(40);
  });
});

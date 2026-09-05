import { describe, expect, it } from "vitest";
import { adviseFallback, rankProviders, type LatencySample } from "../lib/provider-latency-logic";

function sample(providerId: string, latencyMs: number, timestampMs: number): LatencySample {
  return { providerId, latencyMs, timestampMs };
}

const config = { nowMs: 1_000, maxSampleAgeMs: 500, degradedThresholdMs: 400 };

describe("provider latency logic", () => {
  it("ranks lower and more stable latency first", () => {
    const ranking = rankProviders(
      [
        sample("slow", 350, 900),
        sample("slow", 350, 950),
        sample("fast", 100, 900),
        sample("fast", 120, 950),
      ],
      config,
    );
    expect(ranking.map((entry) => entry.providerId)).toEqual(["fast", "slow"]);
    expect(ranking[0].recommendation).toBe("preferred");
    expect(ranking[1].recommendation).toBe("acceptable");
  });

  it("marks providers above the degraded threshold as degraded", () => {
    const ranking = rankProviders([sample("laggy", 900, 900)], config);
    expect(ranking[0].recommendation).toBe("degraded");
  });

  it("ignores stale samples and marks providers without fresh data as stale", () => {
    const ranking = rankProviders([sample("old", 50, 100), sample("fresh", 300, 900)], config);
    const stale = ranking.find((entry) => entry.providerId === "old");
    expect(stale?.recommendation).toBe("stale");
    expect(stale?.sampleCount).toBe(0);
    expect(ranking.find((entry) => entry.providerId === "fresh")?.recommendation).toBe("acceptable");
  });

  it("dampens outliers via EWMA weighting", () => {
    const ranking = rankProviders(
      [sample("p", 100, 800), sample("p", 100, 820), sample("p", 100, 840), sample("p", 5_000, 999)],
      config,
    );
    expect(ranking[0].score).toBeLessThan(5_000);
    expect(ranking[0].score).toBeGreaterThan(100);
  });

  it("ignores invalid samples deterministically", () => {
    const ranking = rankProviders(
      [sample("p", -5, 900), sample("p", Number.NaN, 900), sample("p", 120, 900)],
      config,
    );
    expect(ranking[0].sampleCount).toBe(1);
    expect(ranking[0].score).toBe(120);
  });

  it("advises primary and fallback from the usable ranking", () => {
    const ranking = rankProviders(
      [sample("a", 100, 900), sample("b", 200, 900), sample("c", 1_000, 900)],
      config,
    );
    const advice = adviseFallback(ranking);
    expect(advice.primaryProviderId).toBe("a");
    expect(advice.fallbackProviderId).toBe("b");
    expect(advice.reason).toContain("Fallback");
  });

  it("admits honestly when no usable provider exists", () => {
    const advice = adviseFallback([
      { providerId: "x", score: 0, sampleCount: 0, lastSampleAgeMs: null, recommendation: "stale" },
    ]);
    expect(advice.primaryProviderId).toBeNull();
    expect(advice.reason).toContain("Kein Anbieter");
  });

  it("rejects invalid configurations", () => {
    expect(() => rankProviders([], { ...config, maxSampleAgeMs: 0 })).toThrow();
    expect(() => rankProviders([], { ...config, degradedThresholdMs: -1 })).toThrow();
  });
});

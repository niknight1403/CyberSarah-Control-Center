import { describe, expect, it } from "vitest";
import {
  calculateLatencyStats,
  identifyHotpaths,
  evaluateSLACompliance,
  createHotpathCache,
  LatencyMetric,
} from "../lib/performance-pass-logic";

describe("Sprint 375: Performance-Pass (performance-pass-logic)", () => {
  const sampleMetrics: LatencyMetric[] = [
    { path: "/api/chat", durationMs: 50, timestamp: 1000 },
    { path: "/api/chat", durationMs: 120, timestamp: 1001 },
    { path: "/api/chat", durationMs: 180, timestamp: 1002 },
    { path: "/api/chat", durationMs: 250, timestamp: 1003 },
    { path: "/api/feed", durationMs: 30, timestamp: 1004 },
    { path: "/api/feed", durationMs: 40, timestamp: 1005 },
    { path: "/api/slow", durationMs: 500, timestamp: 1006 },
  ];

  it("berechnet Latenzstatistiken wie Min, Max, Avg und P95 präzise", () => {
    const stats = calculateLatencyStats(sampleMetrics);
    expect(stats["/api/chat"]).toBeDefined();
    expect(stats["/api/chat"].sampleCount).toBe(4);
    expect(stats["/api/chat"].minMs).toBe(50);
    expect(stats["/api/chat"].maxMs).toBe(250);
    expect(stats["/api/chat"].p95Ms).toBe(250);
  });

  it("identifiziert die heißen Pfade (Hotpaths) mit dem höchsten Impakt", () => {
    const hotpaths = identifyHotpaths(sampleMetrics, 2);
    expect(hotpaths.length).toBe(2);
    expect(hotpaths[0].path).toBe("/api/chat");
  });

  it("prüft SLA-Konformität und erkennt Pfade, die die Ziel-Latenz überschreiten", () => {
    const result = evaluateSLACompliance(sampleMetrics, 200);
    expect(result.isCompliant).toBe(false);
    expect(result.violatingPaths.length).toBeGreaterThan(0);

    const fastMetrics: LatencyMetric[] = [
      { path: "/api/fast", durationMs: 50, timestamp: 1000 },
      { path: "/api/fast", durationMs: 60, timestamp: 1001 },
    ];
    const fastResult = evaluateSLACompliance(fastMetrics, 200);
    expect(fastResult.isCompliant).toBe(true);
    expect(fastResult.violatingPaths).toEqual([]);
  });

  it("verwaltet einen In-Memory Hotpath-Cache mit TTL und Kapazität", () => {
    const cache = createHotpathCache<string>(2, 1000);
    const now = 10000;

    cache.set("k1", "v1", 1000, now);
    cache.set("k2", "v2", 1000, now);

    expect(cache.get("k1", now + 100)).toBe("v1");
    expect(cache.get("k3", now + 100)).toBeUndefined();

    // Kapazität testen (k1 entfernen)
    cache.set("k3", "v3", 1000, now);
    expect(cache.get("k1", now + 100)).toBeUndefined();

    // TTL testen
    expect(cache.get("k2", now + 2000)).toBeUndefined();

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(3);
  });
});

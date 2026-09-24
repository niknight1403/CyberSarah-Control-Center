/**
 * Sprint 348 — Tests fuer APK-Groessen- und Startzeit-Metriken.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeApkSize,
  recommendStartupOptimizations,
  totalEstimatedSavingMs,
  AssetBreakdown,
} from "@/lib/apk-size-metrics-logic";

describe("Sprint 348 — APK Size Metrics Logic", () => {
  it("klassifiziert kleine APK als 'small'", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "bundle.js", sizeBytes: 2_000_000, category: "js-bundle" },
        { name: "icon.png", sizeBytes: 100_000, category: "image" },
      ],
    });
    expect(report.classification).toBe("small");
    expect(report.withinBudget).toBe(true);
  });

  it("klassifiziert grosse APK als 'large'", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "bundle.js", sizeBytes: 15_000_000, category: "js-bundle" },
        { name: "video.mp4", sizeBytes: 15_000_000, category: "other" },
      ],
    });
    expect(report.classification).toBe("large");
    expect(report.withinBudget).toBe(false);
  });

  it("liefert 'unknown' bei fehlenden Asset-Daten", () => {
    const report = analyzeApkSize({ assets: [] });
    expect(report.classification).toBe("unknown");
    expect(report.recommendations[0]).toContain("Messung");
  });

  it("identifiziert Top-Offenders nach Groesse sortiert", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "small.js", sizeBytes: 50_000, category: "js-bundle" },
        { name: "big.png", sizeBytes: 3_000_000, category: "image" },
        { name: "med.js", sizeBytes: 500_000, category: "js-bundle" },
      ],
    });
    expect(report.topOffenders[0].name).toBe("big.png");
  });

  it("empfiehlt Bild-Komprimierung bei grossen Bildern", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "hero.png", sizeBytes: 800_000, category: "image" },
      ],
    });
    expect(report.recommendations.some((r) => r.includes("WebP"))).toBe(true);
  });

  it("empfiehlt Tree-Shaking bei grossem JS-Bundle", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "main.js", sizeBytes: 6_000_000, category: "js-bundle" },
      ],
    });
    expect(report.recommendations.some((r) => r.includes("Tree-Shaking"))).toBe(true);
  });

  it("empfiehlt Schriftarten-Reduktion bei >4 Fonts", () => {
    const report = analyzeApkSize({
      assets: [
        { name: "f1.ttf", sizeBytes: 100_000, category: "font" },
        { name: "f2.ttf", sizeBytes: 100_000, category: "font" },
        { name: "f3.ttf", sizeBytes: 100_000, category: "font" },
        { name: "f4.ttf", sizeBytes: 100_000, category: "font" },
        { name: "f5.ttf", sizeBytes: 100_000, category: "font" },
      ],
    });
    expect(report.recommendations.some((r) => r.includes("Schriftarten"))).toBe(true);
  });

  it("recommendStartupOptimizations empfiehlt bei langsamen Phasen", () => {
    const opts = recommendStartupOptimizations([
      { name: "bundle-load", durationMs: 1500 },
      { name: "trpc-handshake", durationMs: 600 },
    ]);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0].estimatedSavingMs).toBeGreaterThan(0);
  });

  it("recommendStartupOptimizations ignoriert schnelle Phasen", () => {
    const opts = recommendStartupOptimizations([
      { name: "bundle-load", durationMs: 200 },
    ]);
    expect(opts).toHaveLength(0);
  });

  it("totalEstimatedSavingMs summiert alle Empfehlungen", () => {
    const opts = recommendStartupOptimizations([
      { name: "bundle-load", durationMs: 2000 },
      { name: "trpc-handshake", durationMs: 1000 },
    ]);
    const total = totalEstimatedSavingMs(opts);
    expect(total).toBeGreaterThan(0);
  });
});

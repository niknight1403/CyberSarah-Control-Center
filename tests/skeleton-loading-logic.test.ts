/**
 * Sprint 346 — Tests fuer Skeleton-Lade-Logik.
 */
import { describe, it, expect } from "vitest";
import {
  buildSkeleton,
  recommendHybridMode,
  shouldHideSkeleton,
  SkeletonType,
  ScreenType,
} from "@/lib/skeleton-loading-logic";

describe("Sprint 346 — Skeleton Loading Logic", () => {
  it("liefert keine Skeletons wenn Daten bereits vorliegen", () => {
    const cfg = buildSkeleton({ screen: "chat", hasData: true });
    expect(cfg.items).toHaveLength(0);
    expect(cfg.minDisplayMs).toBe(0);
  });

  it("liefert Chat-Skeletons mit chat-bubble-Typ", () => {
    const cfg = buildSkeleton({ screen: "chat", hasData: false });
    expect(cfg.items.length).toBeGreaterThan(0);
    expect(cfg.items.every((i) => i.type === "chat-bubble")).toBe(true);
    expect(cfg.isFallback).toBe(false);
  });

  it("liefert Media-Studio-Skeletons mit media-tile-Typ", () => {
    const cfg = buildSkeleton({ screen: "media-studio", hasData: false });
    expect(cfg.items.every((i) => i.type === "media-tile")).toBe(true);
  });

  it("zyklisch bei expectedCount groesser als Preset", () => {
    const cfg = buildSkeleton({ screen: "chat", hasData: false, expectedCount: 12 });
    expect(cfg.items).toHaveLength(12);
  });

  it("kennt Fallback fuer unbekannten Screen", () => {
    const cfg = buildSkeleton({ screen: "generic", hasData: false });
    expect(cfg.isFallback).toBe(false);
    expect(cfg.items.length).toBeGreaterThan(0);
  });

  it("minDisplayMs ist positiv bei Skeletons", () => {
    const cfg = buildSkeleton({ screen: "dashboard", hasData: false });
    expect(cfg.minDisplayMs).toBeGreaterThan(0);
  });

  it("recommendHybridMode trennt geladene und ausstehende Bereiche", () => {
    const result = recommendHybridMode(["header", "stats"], ["chart", "history"]);
    expect(result.show).toEqual(["header", "stats"]);
    expect(result.skeleton).toEqual(["chart", "history"]);
  });

  it("shouldHideSkeleton verweigert Verstecken wenn keine Daten", () => {
    expect(shouldHideSkeleton(500, 200, false)).toBe(false);
  });

  it("shouldHideSkeleton verweigert Verstecken vor minDisplayMs", () => {
    expect(shouldHideSkeleton(100, 200, true)).toBe(false);
  });

  it("shouldHideSkeleton erlaubt Verstecken nach minDisplayMs mit Daten", () => {
    expect(shouldHideSkeleton(300, 200, true)).toBe(true);
  });
});

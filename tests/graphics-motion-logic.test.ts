import { describe, expect, it } from "vitest";
import { shouldAnimateDecorations } from "@/lib/graphics-motion-logic";

describe("Android WebView graphics anti-flicker policy", () => {
  it("disables animation for the Capacitor Android WebView even though RN platform is web", () => {
    expect(shouldAnimateDecorations({ capacitorPlatform: "android", nativePlatform: "web", reducedMotion: false })).toBe(false);
  });
  it("disables animation for native Android and system reduced-motion settings", () => {
    expect(shouldAnimateDecorations({ capacitorPlatform: "web", nativePlatform: "android", reducedMotion: false })).toBe(false);
    expect(shouldAnimateDecorations({ capacitorPlatform: "web", nativePlatform: "web", reducedMotion: true })).toBe(false);
  });
  it("preserves desktop visuals without reduced-motion preference", () => {
    expect(shouldAnimateDecorations({ capacitorPlatform: "web", nativePlatform: "web", reducedMotion: false })).toBe(true);
  });
  it("does not depend on network or authentication state", () => {
    const input = { capacitorPlatform: "android", nativePlatform: "web", reducedMotion: false };
    expect(shouldAnimateDecorations(input)).toBe(false);
    expect(input).toEqual({ capacitorPlatform: "android", nativePlatform: "web", reducedMotion: false });
  });
});

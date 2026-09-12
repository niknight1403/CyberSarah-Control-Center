import { describe, expect, it } from "vitest";

import { baseSchemePalettes, resolveDesignEffects, resolveDesignPalette, resolveDesignRuntimePalette } from "../lib/_core/design-theme-palettes";
import {
  DESIGN_THEMES,
  DESIGN_THEME_STORAGE_KEY,
  designThemeDescription,
  designThemeIcon,
  designThemeLabel,
  normalizeDesignTheme,
} from "../lib/design-theme-logic";

describe("design theme logic", () => {
  it("normalizes only supported design themes", () => {
    expect(normalizeDesignTheme("aurora")).toBe("aurora");
    expect(normalizeDesignTheme("neon")).toBe("neon");
    expect(normalizeDesignTheme("slate")).toBe("slate");
    expect(normalizeDesignTheme("glass")).toBe("glass");
    expect(normalizeDesignTheme("unexpected")).toBe("aurora");
    expect(normalizeDesignTheme(undefined)).toBe("aurora");
  });

  it("exposes exactly the four design themes with stable key and German labels", () => {
    expect(DESIGN_THEMES).toEqual(["aurora", "neon", "slate", "glass"]);
    expect(DESIGN_THEME_STORAGE_KEY).toBe("cybersarah.design-theme.v2");
    expect(designThemeLabel("neon")).toBe("Cyber Neon");
    expect(designThemeLabel("slate")).toBe("Enterprise Slate");
    expect(designThemeLabel("glass")).toBe("Glas-Modern");
    expect(designThemeLabel("aurora")).toBe("Aurora Glass");
    expect(designThemeIcon("neon")).toBe("bolt.fill");
    expect(designThemeIcon("slate")).toBe("chart.bar.fill");
    expect(designThemeIcon("glass")).toBe("sparkles");
    expect(designThemeIcon("aurora")).toBe("wand.and.stars");
    for (const theme of DESIGN_THEMES) {
      expect(designThemeDescription(theme).length).toBeGreaterThan(10);
    }
  });

  it("resolves a complete palette for every design/scheme combination", () => {
    const tokenNames = Object.keys(baseSchemePalettes.light);
    for (const theme of DESIGN_THEMES) {
      for (const scheme of ["light", "dark"] as const) {
        const palette = resolveDesignPalette(theme, scheme);
        expect(Object.keys(palette).sort()).toEqual([...tokenNames].sort());
        for (const value of Object.values(palette)) {
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it("lets each design override the base palette without touching other tokens", () => {
    const neon = resolveDesignPalette("neon", "dark");
    expect(neon.background).not.toBe(baseSchemePalettes.dark.background);
    expect(neon.primary).toBe("#52D8FF");

    const slate = resolveDesignPalette("slate", "light");
    expect(slate.background).not.toBe(baseSchemePalettes.light.background);
    expect(slate.primary).toBe("#1D5BD8");

    const glass = resolveDesignPalette("glass", "dark");
    expect(glass.surface).toContain("rgba");
    expect(glass.border).toContain("rgba");

    const aurora = resolveDesignPalette("aurora", "dark");
    expect(aurora.background).not.toBe(baseSchemePalettes.dark.background);
    expect(aurora.primary).toBe("#9D8CFF");
    expect(aurora.surface).toContain("rgba");
  });

  it("keeps Enterprise Slate light and the neon/glass variants dark", () => {
    const brightness = (hex: string) => {
      const value = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
      return (r * 299 + g * 587 + b * 114) / 1000;
    };
    expect(brightness(resolveDesignPalette("slate", "light").background)).toBeGreaterThan(200);
    expect(brightness(resolveDesignPalette("slate", "dark").background)).toBeLessThan(50);
    expect(brightness(resolveDesignPalette("neon", "dark").background)).toBeLessThan(20);
    expect(brightness(resolveDesignPalette("glass", "dark").background)).toBeLessThan(30);
    expect(brightness(resolveDesignPalette("aurora", "dark").background)).toBeLessThan(30);
    expect(brightness(resolveDesignPalette("aurora", "light").background)).toBeGreaterThan(200);
  });

  it("maps distinct effects per design theme", () => {
    const neon = resolveDesignEffects("neon", "dark");
    expect(neon.glowPrimary).toContain("rgba");
    expect(neon.blur).toBe("0px");

    const slate = resolveDesignEffects("slate", "light");
    expect(slate.glowPrimary).toBe("none");
    expect(slate.blur).toBe("0px");

    const glass = resolveDesignEffects("glass", "dark");
    expect(glass.blur).not.toBe("0px");
    expect(glass.gradientFrom).not.toBe(glass.gradientTo);

    const aurora = resolveDesignEffects("aurora", "dark");
    expect(aurora.glowPrimary).toContain("rgba");
    expect(aurora.glowSoft).toContain("rgba");
    expect(aurora.blur).not.toBe("0px");
    expect(aurora.gradientFrom).not.toBe(aurora.gradientTo);
  });

  it("builds the runtime palette in the Colors shape", () => {
    for (const theme of DESIGN_THEMES) {
      const runtime = resolveDesignRuntimePalette(theme, "dark");
      expect(runtime.text).toBe(runtime.foreground);
      expect(runtime.tint).toBe(runtime.primary);
      expect(runtime.icon).toBe(runtime.muted);
      expect(runtime.tabIconSelected).toBe(runtime.primary);
      expect(runtime.background).toBe(resolveDesignPalette(theme, "dark").background);
    }
  });
});

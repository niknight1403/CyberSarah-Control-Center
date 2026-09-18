import { describe, expect, it } from "vitest";
import { baseSchemePalettes, resolveDesignEffects, resolveDesignPalette, resolveDesignRuntimePalette } from "../lib/_core/design-theme-palettes";
import { DESIGN_THEMES, DESIGN_THEME_STORAGE_KEY, designThemeDescription, designThemeIcon, designThemeLabel, normalizeDesignTheme } from "../lib/design-theme-logic";

describe("design theme logic", () => {
  it("normalizes the four new Neon designs and migrates legacy values", () => {
    for (const theme of ["pulse", "orbit", "synthwave", "minimal"]) expect(normalizeDesignTheme(theme)).toBe(theme);
    for (const legacy of ["neon", "slate", "glass", "ember", "forest", "aurora", undefined, "unexpected"]) expect(normalizeDesignTheme(legacy)).toBe("pulse");
  });

  it("exposes the new Neon design choices", () => {
    expect(DESIGN_THEMES).toEqual(["pulse", "orbit", "synthwave", "minimal"]);
    expect(DESIGN_THEME_STORAGE_KEY).toBe("cybersarah.design-theme.v5");
    expect(designThemeLabel("pulse")).toBe("Neon Pulse");
    expect(designThemeLabel("orbit")).toBe("Cyber Orbit");
    expect(designThemeLabel("synthwave")).toBe("Neon Synthwave");
    expect(designThemeLabel("minimal")).toBe("Neon Minimal");
    expect(designThemeIcon("pulse")).toBe("bolt.fill");
    expect(designThemeIcon("orbit")).toBe("chart.bar.fill");
    expect(designThemeIcon("synthwave")).toBe("sparkles");
    expect(designThemeIcon("minimal")).toBe("wand.and.stars");
    for (const theme of DESIGN_THEMES) expect(designThemeDescription(theme).length).toBeGreaterThan(10);
  });

  it("resolves complete palettes and effects for every Neon design", () => {
    const tokenNames = Object.keys(baseSchemePalettes.light);
    for (const theme of DESIGN_THEMES) {
      for (const scheme of ["light", "dark"] as const) {
        const palette = resolveDesignPalette(theme, scheme);
        expect(Object.keys(palette).sort()).toEqual([...tokenNames].sort());
        expect(Object.values(palette).every((value) => typeof value === "string" && value.length > 3)).toBe(true);
      }
      expect(resolveDesignEffects(theme, "dark").glowPrimary).toContain("rgba");
    }
  });

  it("keeps the new designs visually distinct", () => {
    expect(resolveDesignPalette("pulse", "dark").primary).toBe("#19E6FF");
    expect(resolveDesignPalette("orbit", "dark").primary).toBe("#8B5CFF");
    expect(resolveDesignPalette("synthwave", "dark").primary).toBe("#FF4FD8");
    expect(resolveDesignPalette("minimal", "dark").primary).toBe("#00F5D4");
    expect(resolveDesignPalette("pulse", "dark").background).toBe("#03111D");
    expect(resolveDesignPalette("orbit", "dark").background).toBe("#080D24");
  });

  it("builds the runtime Colors shape", () => {
    for (const theme of DESIGN_THEMES) {
      const runtime = resolveDesignRuntimePalette(theme, "dark");
      expect(runtime.text).toBe(runtime.foreground);
      expect(runtime.tint).toBe(runtime.primary);
      expect(runtime.icon).toBe(runtime.muted);
      expect(runtime.tabIconSelected).toBe(runtime.primary);
    }
  });
});

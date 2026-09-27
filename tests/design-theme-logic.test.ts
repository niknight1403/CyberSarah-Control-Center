import { describe, expect, it } from "vitest";
import { baseSchemePalettes, resolveDesignEffects, resolveDesignPalette, resolveDesignRuntimePalette } from "../lib/_core/design-theme-palettes";
import { DEFAULT_DESIGN_THEME, DESIGN_THEMES, DESIGN_THEME_STORAGE_KEY, designThemeDescription, designThemeIcon, designThemeLabel, normalizeDesignTheme } from "../lib/design-theme-logic";

describe("design theme logic", () => {
  it("normalizes the four new Neon designs and migrates legacy values", () => {
    // Sprint 355 — Aurora Flow ist das einzige Design: ALLE gespeicherten
    // Werte (auch die 9 entfernten Neon-Varianten) migrieren auf "aurora".
    for (const theme of ["pulse", "orbit", "synthwave", "minimal", "oracle", "borealis", "quantum", "nebula", "phoenix"]) expect(normalizeDesignTheme(theme)).toBe("aurora");
    for (const legacy of ["neon", "slate", "glass", "ember", "forest", "aurora", undefined, "unexpected", null, 42]) expect(normalizeDesignTheme(legacy)).toBe("aurora");
  });

  it("exposes genau EIN Design: Aurora Flow (Sprint 355)", () => {
    expect(DESIGN_THEMES).toEqual(["aurora"]);
    expect(DEFAULT_DESIGN_THEME).toBe("aurora");
    expect(DESIGN_THEME_STORAGE_KEY).toBe("cybersarah.design-theme.v6");
    expect(designThemeLabel("aurora")).toBe("Aurora Flow");
    expect(designThemeIcon("aurora")).toBe("sparkles");
    expect(designThemeDescription("aurora").length).toBeGreaterThan(10);
  });

  it("resolves complete palettes and effects for Aurora Flow", () => {
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

  it("traegt die Aurora-Flow-Signaturfarben (Violett → Cyan auf Nachtblau)", () => {
    expect(resolveDesignPalette("aurora", "dark").primary).toBe("#00F2FE");
    expect(resolveDesignPalette("aurora", "dark").accent).toBe("#7C3AED");
    expect(resolveDesignPalette("aurora", "dark").background).toBe("#0A0E1A");
    expect(resolveDesignPalette("aurora", "light").primary).toBe("#7C3AED");
  });

  it("builds the runtime Colors shape", () => {
    for (const theme of DESIGN_THEMES) {
      const runtime = resolveDesignRuntimePalette(theme, "dark");
      expect(runtime.text).toBe(runtime.foreground);
      expect(runtime.tint).toBe(runtime.primary);
      // Sprint 160: icon ist ein eigenstaendiges Token und bewusst nicht
      // mehr an muted gekoppelt (vgl. Theme-Registry design-theme-palettes).
      expect(runtime.icon).toBe(resolveDesignPalette(theme, "dark").icon);
      expect(typeof runtime.icon).toBe("string");
      expect(runtime.tabIconSelected).toBe(runtime.primary);
    }
  });
});

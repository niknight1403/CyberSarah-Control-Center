import type { ColorScheme, ThemeColorPalette } from "@/constants/theme";
import type { DesignTheme } from "@/lib/design-theme-logic";
import themeConfig from "../../theme.config";

type ColorTokenName = keyof typeof themeConfig.themeColors;
export type DesignPalette = Record<ColorTokenName, string>;

export const baseSchemePalettes: Record<ColorScheme, DesignPalette> = {
  light: Object.fromEntries((Object.keys(themeConfig.themeColors) as ColorTokenName[]).map((name) => [name, themeConfig.themeColors[name].light])) as DesignPalette,
  dark: Object.fromEntries((Object.keys(themeConfig.themeColors) as ColorTokenName[]).map((name) => [name, themeConfig.themeColors[name].dark])) as DesignPalette,
};

export type DesignThemeEffects = {
  glowPrimary: string;
  glowSoft: string;
  blur: string;
  gradientFrom: string;
  gradientTo: string;
};

type TokenOverrides = Partial<DesignPalette>;
export type DesignThemeDefinition = {
  light: TokenOverrides;
  dark: TokenOverrides;
  effects: Record<ColorScheme, DesignThemeEffects>;
};

const effects = (primary: string, secondary: string, from: string, to: string, blur = "8px"): Record<ColorScheme, DesignThemeEffects> => ({
  light: { glowPrimary: `0 0 20px ${primary}, 0 0 42px ${secondary}`, glowSoft: `0 0 14px ${secondary}`, blur, gradientFrom: from, gradientTo: to },
  dark: { glowPrimary: `0 0 24px ${primary}, 0 0 52px ${secondary}`, glowSoft: `0 0 16px ${secondary}`, blur, gradientFrom: from, gradientTo: to },
});

/**
 * Vollstaendige Token-Registry — Sprint 160 (persistentes Design-System).
 * Jede der vier Neon-Varianten definiert ALLE 14 Pflicht-Tokens (background,
 * backgroundElevated, surface, surfaceStrong, border, text/foreground, muted,
 * icon, tint/primary, success, warning, error, shadow, accent) fuer light UND
 * dark, damit kein Screen auf einen impliziten Fallback angewiesen ist.
 * "accent" ist bewusst die jeweilige Sekundaerfarbe des Glow-Effekts (siehe
 * effects()-Aufruf unten), damit Akzent-Badges optisch zur Glow-Palette passen.
 */
export const DesignThemeDefinitions: Record<DesignTheme, DesignThemeDefinition> = {
  aurora: {
    light: {
      background: "#F4F3FF", backgroundElevated: "#EBE9FE", surface: "#FAFAFF", surfaceStrong: "#EDEBFF",
      border: "#8E7BFF", foreground: "#10102E", primary: "#7C3AED", muted: "#5B5B87", icon: "#4E4E78",
      success: "#0FA968", warning: "#B57E00", error: "#D64D66", accent: "#00B8D9", shadow: "rgba(16, 16, 46, 0.14)",
    },
    dark: {
      background: "#0A0E1A", backgroundElevated: "#10152A", surface: "#141B33", surfaceStrong: "#1B2340",
      border: "#7C8BFF", foreground: "#F2F6FC", primary: "#00F2FE", muted: "#99A7B8", icon: "#7C93A8",
      success: "#45D996", warning: "#F6BA5E", error: "#FF6B7A", accent: "#7C3AED", shadow: "rgba(4, 7, 16, 0.6)",
    },
    effects: effects("rgba(124,58,237,.46)", "rgba(0,242,254,.28)", "#0A0E1A", "#141B33"),
  },
};

export function resolveDesignPalette(designTheme: DesignTheme, scheme: ColorScheme): DesignPalette {
  return { ...baseSchemePalettes[scheme], ...DesignThemeDefinitions[designTheme][scheme] };
}

export function resolveDesignEffects(designTheme: DesignTheme, scheme: ColorScheme): DesignThemeEffects {
  return DesignThemeDefinitions[designTheme].effects[scheme];
}

export function resolveDesignRuntimePalette(designTheme: DesignTheme, scheme: ColorScheme): ThemeColorPalette {
  const base = resolveDesignPalette(designTheme, scheme);
  return {
    ...base,
    text: base.foreground,
    background: base.background,
    tint: base.primary,
    icon: base.icon,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
    border: base.border,
  };
}

export function effectCssVariables(effects: DesignThemeEffects): Record<string, string> {
  return { "effect-glow-primary": effects.glowPrimary, "effect-glow-soft": effects.glowSoft, "effect-blur": effects.blur, "effect-gradient-from": effects.gradientFrom, "effect-gradient-to": effects.gradientTo };
}

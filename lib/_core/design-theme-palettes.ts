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
  pulse: {
    light: {
      background: "#EAFBFF", backgroundElevated: "#DFF6FC", surface: "#F8FDFF", surfaceStrong: "#EFFBFF",
      border: "#8DEBFF", foreground: "#071827", primary: "#00BFD9", muted: "#52758C", icon: "#4C6B7D",
      success: "#00A86B", warning: "#C17A00", error: "#D64463", accent: "#6F5FE0", shadow: "rgba(10, 27, 42, 0.14)",
    },
    dark: {
      background: "#0A0D12", backgroundElevated: "#10151F", surface: "#121823", surfaceStrong: "#1B2434",
      border: "#52D8FF", foreground: "#F2F6FC", primary: "#52D8FF", muted: "#99A7B8", icon: "#7C93A8",
      success: "#45D996", warning: "#F6BA5E", error: "#FF6B7A", accent: "#8B7CFF", shadow: "rgba(5, 8, 12, 0.55)",
    },
    effects: effects("rgba(82,216,255,.45)", "rgba(139,124,255,.28)", "#0A0D12", "#121823"),
  },
  orbit: {
    light: {
      background: "#EEF0FF", backgroundElevated: "#E4E7FC", surface: "#FAFAFF", surfaceStrong: "#F0F1FE",
      border: "#9C9BFF", foreground: "#11142B", primary: "#6551E8", muted: "#65709A", icon: "#5A6494",
      success: "#00A783", warning: "#B87A00", error: "#CF456A", accent: "#2FB8CC", shadow: "rgba(17, 20, 43, 0.14)",
    },
    dark: {
      background: "#080D24", backgroundElevated: "#0E1533", surface: "#101A3B", surfaceStrong: "#182552",
      border: "#5368FF", foreground: "#F2F4FF", primary: "#8B5CFF", muted: "#A8B4E8", icon: "#8A93C9",
      success: "#00E7C1", warning: "#FFD166", error: "#FF668D", accent: "#19E6FF", shadow: "rgba(5, 7, 20, 0.55)",
    },
    effects: effects("rgba(139,92,255,.48)", "rgba(25,230,255,.24)", "#080D24", "#17113A", "10px"),
  },
  synthwave: {
    light: {
      background: "#FFF0FA", backgroundElevated: "#FBE4F3", surface: "#FFF9FD", surfaceStrong: "#FDEEF9",
      border: "#FF9DDD", foreground: "#261127", primary: "#E62FBC", muted: "#8A6386", icon: "#7A5678",
      success: "#00A879", warning: "#C57900", error: "#D34B5D", accent: "#E67A2E", shadow: "rgba(40, 10, 30, 0.14)",
    },
    dark: {
      background: "#170A20", backgroundElevated: "#200D2B", surface: "#27112E", surfaceStrong: "#331640",
      border: "#FF4FD8", foreground: "#FFF5FE", primary: "#FF4FD8", muted: "#D2A9CE", icon: "#C79BC2",
      success: "#00F0A4", warning: "#FFB347", error: "#FF718A", accent: "#FF9240", shadow: "rgba(20, 5, 25, 0.55)",
    },
    effects: effects("rgba(255,79,216,.48)", "rgba(255,146,64,.3)", "#170A20", "#2E1029", "8px"),
  },
  minimal: {
    light: {
      background: "#EFFAF7", backgroundElevated: "#E2F5EE", surface: "#FBFFFE", surfaceStrong: "#F1FBF7",
      border: "#81E4CA", foreground: "#071C19", primary: "#00A98F", muted: "#5A7E78", icon: "#4E7168",
      success: "#00A56B", warning: "#B87800", error: "#D0445A", accent: "#00B87C", shadow: "rgba(5, 25, 20, 0.1)",
    },
    dark: {
      background: "#061513", backgroundElevated: "#0A1D1A", surface: "#0C2420", surfaceStrong: "#123330",
      border: "#00F5D4", foreground: "#F0FFF9", primary: "#00F5D4", muted: "#9BC8BC", icon: "#7FAFA3",
      success: "#63FFB0", warning: "#FFD166", error: "#FF7488", accent: "#00F59B", shadow: "rgba(2, 10, 8, 0.5)",
    },
    effects: effects("rgba(0,245,212,.4)", "rgba(0,245,155,.22)", "#061513", "#0C2420", "4px"),
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

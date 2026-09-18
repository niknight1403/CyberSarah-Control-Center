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

export const DesignThemeDefinitions: Record<DesignTheme, DesignThemeDefinition> = {
  pulse: {
    light: { background: "#EAFBFF", surface: "#F8FDFF", border: "#8DEBFF", foreground: "#071827", primary: "#00BFD9", muted: "#52758C", success: "#00A86B", warning: "#C17A00", error: "#D64463" },
    dark: { background: "#03111D", surface: "#071B2A", border: "#19E6FF", foreground: "#F4F8FF", primary: "#19E6FF", muted: "#A9C1D8", success: "#00F59B", warning: "#FFC857", error: "#FF5577" },
    effects: effects("rgba(25,230,255,.45)", "rgba(240,45,255,.28)", "#03111D", "#071B2A"),
  },
  orbit: {
    light: { background: "#EEF0FF", surface: "#FAFAFF", border: "#9C9BFF", foreground: "#11142B", primary: "#6551E8", muted: "#65709A", success: "#00A783", warning: "#B87A00", error: "#CF456A" },
    dark: { background: "#080D24", surface: "#101A3B", border: "#5368FF", foreground: "#F2F4FF", primary: "#8B5CFF", muted: "#A8B4E8", success: "#00E7C1", warning: "#FFD166", error: "#FF668D" },
    effects: effects("rgba(139,92,255,.48)", "rgba(25,230,255,.24)", "#080D24", "#17113A", "10px"),
  },
  synthwave: {
    light: { background: "#FFF0FA", surface: "#FFF9FD", border: "#FF9DDD", foreground: "#261127", primary: "#E62FBC", muted: "#8A6386", success: "#00A879", warning: "#C57900", error: "#D34B5D" },
    dark: { background: "#170A20", surface: "#27112E", border: "#FF4FD8", foreground: "#FFF5FE", primary: "#FF4FD8", muted: "#D2A9CE", success: "#00F0A4", warning: "#FFB347", error: "#FF718A" },
    effects: effects("rgba(255,79,216,.48)", "rgba(255,146,64,.3)", "#170A20", "#2E1029", "8px"),
  },
  minimal: {
    light: { background: "#EFFAF7", surface: "#FBFFFE", border: "#81E4CA", foreground: "#071C19", primary: "#00A98F", muted: "#5A7E78", success: "#00A56B", warning: "#B87800", error: "#D0445A" },
    dark: { background: "#061513", surface: "#0C2420", border: "#00F5D4", foreground: "#F0FFF9", primary: "#00F5D4", muted: "#9BC8BC", success: "#63FFB0", warning: "#FFD166", error: "#FF7488" },
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
  return { ...base, text: base.foreground, background: base.background, tint: base.primary, icon: base.muted, tabIconDefault: base.muted, tabIconSelected: base.primary, border: base.border };
}

export function effectCssVariables(effects: DesignThemeEffects): Record<string, string> {
  return { "effect-glow-primary": effects.glowPrimary, "effect-glow-soft": effects.glowSoft, "effect-blur": effects.blur, "effect-gradient-from": effects.gradientFrom, "effect-gradient-to": effects.gradientTo };
}

/**
 * Paletten und Effekt-Tokens der drei Design-Themes.
 *
 * Ein Design-Theme ueberschreibt die Basis-Palette (SchemeColors) pro
 * Farbschema und bringt zusaetzliche Effekt-Tokens mit, die der
 * Theme-Provider als CSS-Variablen bereitstellt:
 *   --effect-glow-primary / --effect-glow-soft  (Box-Shadow)
 *   --effect-blur                                (backdrop-filter)
 *   --effect-gradient-from / --effect-gradient-to
 *
 * Utilities in global.css (.effect-glow, .effect-glass, .effect-gradient)
 * konsumieren diese Variablen, damit Flaechen das aktive Design aufnehmen.
 */

import type { ColorScheme, ThemeColorPalette } from "@/constants/theme";
import { type DesignTheme } from "@/lib/design-theme-logic";
import themeConfig from "../../theme.config";

type ColorTokenName = keyof typeof themeConfig.themeColors;
export type DesignPalette = Record<ColorTokenName, string>;

/**
 * Basis-Palette pro Farbschema, direkt aus theme.config gebaut — ohne die
 * react-native-Kette aus lib/_core/theme, damit dieses Modul auch in
 * Node/Vitest lauffaehig bleibt.
 */
export const baseSchemePalettes: Record<ColorScheme, DesignPalette> = {
  light: Object.fromEntries(
    (Object.keys(themeConfig.themeColors) as ColorTokenName[]).map((name) => [name, themeConfig.themeColors[name].light]),
  ) as DesignPalette,
  dark: Object.fromEntries(
    (Object.keys(themeConfig.themeColors) as ColorTokenName[]).map((name) => [name, themeConfig.themeColors[name].dark]),
  ) as DesignPalette,
};

export type DesignThemeEffects = {
  /** Box-Shadow für primäre Glow-Akzente ("none" ohne Glow). */
  glowPrimary: string;
  /** Dezentere Sekundär-Glows ("none" ohne Glow). */
  glowSoft: string;
  /** backdrop-filter Stärke als CSS-Länge ("0px" ohne Blur). */
  blur: string;
  /** Gradient-Verlauf für Hintergründe (from → to). */
  gradientFrom: string;
  gradientTo: string;
};

type TokenOverrides = Partial<DesignPalette>;

export type DesignThemeDefinition = {
  light: TokenOverrides;
  dark: TokenOverrides;
  effects: Record<ColorScheme, DesignThemeEffects>;
};

const noGlow: DesignThemeEffects = {
  glowPrimary: "none",
  glowSoft: "none",
  blur: "0px",
  gradientFrom: "#12161D",
  gradientTo: "#12161D",
};

export const DesignThemeDefinitions: Record<DesignTheme, DesignThemeDefinition> = {
  /** Theme A — Cyber Neon / Dark Obsidian */
  neon: {
    light: {
      background: "#0D1320",
      surface: "#151E2E",
      border: "#33445F",
    },
    dark: {
      background: "#05070C",
      surface: "#0B1220",
      border: "#26354E",
      foreground: "#F2F6FC",
      primary: "#52D8FF",
      muted: "#93A5BD",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(82, 216, 255, 0.35), 0 0 40px rgba(82, 216, 255, 0.18)",
        glowSoft: "0 0 12px rgba(255, 61, 173, 0.22)",
        blur: "0px",
        gradientFrom: "#0D1320",
        gradientTo: "#080C16",
      },
      dark: {
        glowPrimary: "0 0 22px rgba(82, 216, 255, 0.45), 0 0 46px rgba(82, 216, 255, 0.2)",
        glowSoft: "0 0 14px rgba(255, 61, 173, 0.28)",
        blur: "0px",
        gradientFrom: "#05070C",
        gradientTo: "#0A0F1C",
      },
    },
  },

  /** Theme B — Enterprise Slate */
  slate: {
    light: {
      background: "#F2F5F8",
      surface: "#FFFFFF",
      border: "#D9DFE8",
      foreground: "#17202D",
      primary: "#1D5BD8",
      muted: "#5C6B7E",
      success: "#178A50",
      warning: "#B2740B",
      error: "#C2404F",
    },
    dark: {
      background: "#12161D",
      surface: "#1B212B",
      border: "#2B3542",
      foreground: "#E9EEF5",
      primary: "#7AA7F5",
      muted: "#94A1B4",
      success: "#3BBE7B",
      warning: "#E5A84C",
      error: "#E9707D",
    },
    effects: {
      light: { ...noGlow, gradientFrom: "#F2F5F8", gradientTo: "#E8ECF2" },
      dark: noGlow,
    },
  },

  /** Theme C — Glassmorphism Modern */
  glass: {
    light: {
      background: "#E7EDF7",
      surface: "rgba(255, 255, 255, 0.62)",
      border: "rgba(20, 35, 60, 0.12)",
      foreground: "#1B2437",
      primary: "#6D5CE6",
      muted: "#55617A",
      success: "#148556",
      warning: "#A96A0B",
      error: "#C2404F",
    },
    dark: {
      background: "#0B1220",
      surface: "rgba(255, 255, 255, 0.07)",
      border: "rgba(255, 255, 255, 0.14)",
      foreground: "#EEF2FF",
      primary: "#8F7BFF",
      muted: "#A7B3D0",
      success: "#4ADE96",
      warning: "#FBBE6C",
      error: "#FF7B8A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(109, 92, 230, 0.25)",
        glowSoft: "none",
        blur: "14px",
        gradientFrom: "#DDE6F5",
        gradientTo: "#EFEBFA",
      },
      dark: {
        glowPrimary: "0 0 20px rgba(143, 123, 255, 0.3)",
        glowSoft: "0 0 12px rgba(79, 209, 255, 0.2)",
        blur: "18px",
        gradientFrom: "#101A30",
        gradientTo: "#221A46",
      },
    },
  },
  /** Theme D — Aurora Glass (Standard seit v1.3.1) */
  aurora: {
    light: {
      background: "#F3F4FC",
      surface: "rgba(255, 255, 255, 0.66)",
      border: "rgba(56, 45, 122, 0.14)",
      foreground: "#241E3F",
      primary: "#7C5CFF",
      muted: "#6B7092",
      success: "#0FA47A",
      warning: "#C77A15",
      error: "#C2404F",
    },
    dark: {
      background: "#0A0E1F",
      surface: "rgba(255, 255, 255, 0.07)",
      border: "rgba(255, 255, 255, 0.14)",
      foreground: "#EEF1FB",
      primary: "#9D8CFF",
      muted: "#9AA3C7",
      success: "#4ADE96",
      warning: "#FBBE6C",
      error: "#FF7B8A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(124, 92, 255, 0.22)",
        glowSoft: "0 0 12px rgba(45, 212, 191, 0.16)",
        blur: "14px",
        gradientFrom: "#E3E6FA",
        gradientTo: "#F3F0FB",
      },
      dark: {
        glowPrimary: "0 0 22px rgba(157, 140, 255, 0.34)",
        glowSoft: "0 0 14px rgba(45, 212, 191, 0.22)",
        blur: "18px",
        gradientFrom: "#150F36",
        gradientTo: "#072031",
      },
    },
  },
};

/** Basis-Palette des Schemas mit den Design-Overrides verschmelzen. */
export function resolveDesignPalette(designTheme: DesignTheme, scheme: ColorScheme): DesignPalette {
  const base = baseSchemePalettes[scheme];
  const overrides = DesignThemeDefinitions[designTheme][scheme];
  return { ...base, ...overrides };
}

export function resolveDesignEffects(designTheme: DesignTheme, scheme: ColorScheme): DesignThemeEffects {
  return DesignThemeDefinitions[designTheme].effects[scheme];
}

/**
 * Laufzeit-Palette im Format von Colors (text, tint, icon, ...) — inklusive
 * Design-Auflösung, damit style-basierte Konsumenten (useColors) das aktive
 * Design widerspiegeln.
 */
export function resolveDesignRuntimePalette(designTheme: DesignTheme, scheme: ColorScheme): ThemeColorPalette {
  const base = resolveDesignPalette(designTheme, scheme);
  return {
    ...base,
    text: base.foreground,
    background: base.background,
    tint: base.primary,
    icon: base.muted,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
    border: base.border,
  };
}

/** Effekt-Tokens als flaches Record für CSS-Variablen-/vars()-Applikation. */
export function effectCssVariables(effects: DesignThemeEffects): Record<string, string> {
  return {
    "effect-glow-primary": effects.glowPrimary,
    "effect-glow-soft": effects.glowSoft,
    "effect-blur": effects.blur,
    "effect-gradient-from": effects.gradientFrom,
    "effect-gradient-to": effects.gradientTo,
  };
}

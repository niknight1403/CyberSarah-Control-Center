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
      background: "#030617",
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
  /** Theme F — Living AI Interface (Standard seit v1.4.1 / Sprint 89) */
  living: {
    light: {
      background: "#F5F3FF",
      surface: "rgba(255, 255, 255, 0.62)",
      border: "rgba(94, 82, 214, 0.14)",
      foreground: "#221C46",
      primary: "#7C5CFF",
      muted: "#6B7092",
      success: "#22C9A7",
      warning: "#FBBE6C",
      error: "#FF7B8A",
    },
    dark: {
      background: "#030617",
      surface: "rgba(255, 255, 255, 0.07)",
      border: "rgba(255, 255, 255, 0.14)",
      foreground: "#EEF1FF",
      primary: "#9D8CFF",
      muted: "#9AA3C7",
      success: "#4ADE96",
      warning: "#FBBE6C",
      error: "#FF7B8A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(124, 92, 255, 0.25)",
        glowSoft: "0 0 12px rgba(56, 209, 255, 0.16)",
        blur: "16px",
        gradientFrom: "#EDEBFA",
        gradientTo: "#E6F2FB",
      },
      dark: {
        glowPrimary: "0 0 24px rgba(157, 140, 255, 0.4)",
        glowSoft: "0 0 14px rgba(56, 209, 255, 0.26)",
        blur: "20px",
        gradientFrom: "#150F38",
        gradientTo: "#062033",
      },
    },
  },
  /** Theme G — Cyber Obsidian / Hyper-Fluid (Sprint 108, 14.09.2026) */
  obsidian: {
    light: {
      background: "#030508",
      surface: "rgba(255, 255, 255, 0.06)",
      border: "rgba(0, 240, 255, 0.18)",
      foreground: "#E9FBFF",
      primary: "#00F0FF",
      muted: "#7BA3B8",
      success: "#34E5A0",
      warning: "#FBBE6C",
      error: "#FF6B9E",
    },
    dark: {
      background: "#030508",
      surface: "rgba(255, 255, 255, 0.06)",
      border: "rgba(0, 240, 255, 0.18)",
      foreground: "#E9FBFF",
      primary: "#00F0FF",
      muted: "#7BA3B8",
      success: "#34E5A0",
      warning: "#FBBE6C",
      error: "#FF6B9E",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(0, 240, 255, 0.28)",
        glowSoft: "0 0 12px rgba(139, 92, 246, 0.18)",
        blur: "16px",
        gradientFrom: "#030508",
        gradientTo: "#0C1030",
      },
      dark: {
        glowPrimary: "0 0 26px rgba(0, 240, 255, 0.42)",
        glowSoft: "0 0 14px rgba(139, 92, 246, 0.3)",
        blur: "18px",
        gradientFrom: "#030508",
        gradientTo: "#0C1030",
      },
    },
  },
  /** Theme H — Aurora Borealis Glass (Sprint 108, 14.09.2026) */
  borealis: {
    light: {
      background: "#EEF2FF",
      surface: "rgba(255, 255, 255, 0.68)",
      border: "rgba(79, 70, 229, 0.16)",
      foreground: "#1E1B4B",
      primary: "#6366F1",
      muted: "#6B7192",
      success: "#0FA47A",
      warning: "#C77A15",
      error: "#C2404F",
    },
    dark: {
      background: "#050A1F",
      surface: "rgba(255, 255, 255, 0.08)",
      border: "rgba(148, 163, 255, 0.18)",
      foreground: "#FFFFFF",
      primary: "#22D3EE",
      muted: "#9BA8D8",
      success: "#4ADE96",
      warning: "#FBBE6C",
      error: "#FF7B8A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(99, 102, 241, 0.24)",
        glowSoft: "0 0 12px rgba(45, 212, 191, 0.16)",
        blur: "18px",
        gradientFrom: "#C7D2FE",
        gradientTo: "#99F6E4",
      },
      dark: {
        glowPrimary: "0 0 24px rgba(34, 211, 238, 0.38)",
        glowSoft: "0 0 14px rgba(139, 92, 246, 0.3)",
        blur: "22px",
        gradientFrom: "#251A5C",
        gradientTo: "#0A2E4E",
      },
    },
  },
  /** Theme I — Neon Rose & Cyber Pastel (Sprint 108, 14.09.2026) */
  rose: {
    light: {
      background: "#FDF2F8",
      surface: "rgba(255, 255, 255, 0.72)",
      border: "rgba(255, 42, 133, 0.18)",
      foreground: "#2A0F22",
      primary: "#FF2A85",
      muted: "#9C7A8C",
      success: "#0FA47A",
      warning: "#E8A23D",
      error: "#C2404F",
    },
    dark: {
      background: "#0A0915",
      surface: "rgba(255, 255, 255, 0.06)",
      border: "rgba(255, 42, 133, 0.24)",
      foreground: "#FDF4FA",
      primary: "#FF2A85",
      muted: "#9C8FA8",
      success: "#4ADE96",
      warning: "#FFB7D5",
      error: "#FF5C7A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 16px rgba(255, 42, 133, 0.22)",
        glowSoft: "0 0 10px rgba(255, 183, 213, 0.18)",
        blur: "14px",
        gradientFrom: "#FCE7F3",
        gradientTo: "#EDE9FE",
      },
      dark: {
        glowPrimary: "0 0 24px rgba(255, 42, 133, 0.45)",
        glowSoft: "0 0 12px rgba(255, 183, 213, 0.24)",
        blur: "16px",
        gradientFrom: "#0A0915",
        gradientTo: "#241042",
      },
    },
  },
  /** Theme E — Retro Cyber-Terminal (Standard seit v1.4.0 / Sprint 88) */
  retro: {
    light: {
      background: "#000000",
      surface: "#0A0A0A",
      border: "#4D3A00",
      foreground: "#FFB000",
      primary: "#FFB000",
      muted: "#8A6D1F",
      success: "#3ADB76",
      warning: "#FFD24A",
      error: "#FF4A3A",
    },
    dark: {
      background: "#000000",
      surface: "#0A0A0A",
      border: "#4D3A00",
      foreground: "#FFB000",
      primary: "#FFB000",
      muted: "#8A6D1F",
      success: "#3ADB76",
      warning: "#FFD24A",
      error: "#FF4A3A",
    },
    effects: {
      light: {
        glowPrimary: "0 0 18px rgba(255, 176, 0, 0.35)",
        glowSoft: "none",
        blur: "0px",
        gradientFrom: "#000000",
        gradientTo: "#0A0800",
      },
      dark: {
        glowPrimary: "0 0 22px rgba(255, 176, 0, 0.42)",
        glowSoft: "0 0 12px rgba(255, 176, 0, 0.2)",
        blur: "0px",
        gradientFrom: "#000000",
        gradientTo: "#0A0800",
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

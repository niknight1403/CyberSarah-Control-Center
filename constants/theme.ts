/**
 * Thin re-exports so consumers don't need to know about internal theme plumbing.
 * Full implementation lives in lib/_core/theme.ts.
 */
export {
  Colors,
  Fonts,
  SchemeColors,
  ThemeColors,
  type ColorScheme,
  type ThemeColorPalette,
} from "@/lib/_core/theme";

export {
  DesignPalette,
  type DesignThemeDefinition,
  type DesignThemeEffects,
  resolveDesignEffects,
  resolveDesignPalette,
  resolveDesignRuntimePalette,
  effectCssVariables,
} from "@/lib/_core/design-theme-palettes";
export { type DesignTheme } from "@/lib/design-theme-logic";

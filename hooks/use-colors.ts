import { useMemo } from "react";
import { type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { resolveDesignRuntimePalette } from "@/lib/_core/design-theme-palettes";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette (design-theme aware).
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { designTheme, colorScheme, palette } = useThemeContext();
  const scheme = (colorSchemeOverride ?? colorScheme ?? "light") as ColorScheme;
  // Stable reference prevents visual animation effects from restarting on each data refresh.
  return useMemo(
    () => scheme === colorScheme ? palette : resolveDesignRuntimePalette(designTheme, scheme),
    [designTheme, scheme, colorScheme, palette],
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import {
  DEFAULT_DESIGN_THEME,
  DESIGN_THEME_STORAGE_KEY,
  normalizeDesignTheme,
  type DesignTheme,
} from "@/lib/design-theme-logic";
import {
  effectCssVariables,
  resolveDesignEffects,
  resolveDesignPalette,
  resolveDesignRuntimePalette,
} from "@/lib/_core/design-theme-palettes";
import { normalizeThemePreference, resolveThemePreference, THEME_PREFERENCE_STORAGE_KEY, type ThemePreference } from "@/lib/theme-preference-logic";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  themePreference: ThemePreference;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemePreference: (preference: ThemePreference) => void;
  designTheme: DesignTheme;
  setDesignTheme: (theme: DesignTheme) => void;
  /** Laufzeit-Palette des aktiven Designs (inklusive text, tint, icon, ...). */
  palette: ThemeColorPalette;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const rawSystemScheme = useSystemColorScheme();
  const systemScheme: ColorScheme = rawSystemScheme === "dark" ? "dark" : "light";
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [designTheme, setDesignThemeState] = useState<DesignTheme>(DEFAULT_DESIGN_THEME);
  const colorScheme = resolveThemePreference(themePreference, systemScheme);
  const palette = useMemo(() => resolveDesignRuntimePalette(designTheme, colorScheme), [designTheme, colorScheme]);

  const applyTheme = useCallback((scheme: ColorScheme, theme: DesignTheme) => {
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      root.dataset.designTheme = theme;
      const resolved = resolveDesignPalette(theme, scheme);
      Object.entries(resolved).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
      Object.entries(effectCssVariables(resolveDesignEffects(theme, scheme))).forEach(([token, value]) => {
        root.style.setProperty(`--${token}`, value);
      });
    }
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    const normalized = normalizeThemePreference(preference);
    setThemePreferenceState(normalized);
    void AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, normalized);
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setThemePreference(scheme);
  }, [setThemePreference]);

  const setDesignTheme = useCallback((theme: DesignTheme) => {
    const normalized = normalizeDesignTheme(theme);
    setDesignThemeState(normalized);
    void AsyncStorage.setItem(DESIGN_THEME_STORAGE_KEY, normalized);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
      AsyncStorage.getItem(DESIGN_THEME_STORAGE_KEY),
    ])
      .then(([storedPreference, storedDesign]) => {
        if (!active) return;
        if (storedPreference) setThemePreferenceState(normalizeThemePreference(storedPreference));
        if (storedDesign) setDesignThemeState(normalizeDesignTheme(storedDesign));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyTheme(colorScheme, designTheme);
  }, [applyTheme, colorScheme, designTheme]);

  const themeVariables = useMemo(() => {
    const resolved = resolveDesignPalette(designTheme, colorScheme);
    const effectEntries = effectCssVariables(resolveDesignEffects(designTheme, colorScheme));
    return vars({
      ...Object.fromEntries(Object.entries(resolved).map(([token, value]) => [`color-${token}`, value])),
      ...effectEntries,
    });
  }, [colorScheme, designTheme]);

  const value = useMemo(
    () => ({
      colorScheme,
      themePreference,
      setColorScheme,
      setThemePreference,
      designTheme,
      setDesignTheme,
      palette,
    }),
    [colorScheme, themePreference, setColorScheme, setThemePreference, designTheme, setDesignTheme, palette],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}

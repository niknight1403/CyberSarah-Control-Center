export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_STORAGE_KEY = "cybersarah.theme-preference.v1";

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveThemePreference(preference: ThemePreference, systemScheme: "light" | "dark"): "light" | "dark" {
  return preference === "system" ? systemScheme : preference;
}

export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === "dark") return "Dunkel";
  if (preference === "light") return "Hell";
  return "System";
}

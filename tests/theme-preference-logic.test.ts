import { describe, expect, it } from "vitest";
import {
  normalizeThemePreference,
  resolveThemePreference,
  THEME_PREFERENCE_STORAGE_KEY,
  themePreferenceLabel,
} from "../lib/theme-preference-logic";

describe("theme preference logic", () => {
  it("normalizes only supported preferences", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("system")).toBe("system");
    expect(normalizeThemePreference("unexpected")).toBe("system");
  });

  it("resolves system preference against the device scheme", () => {
    expect(resolveThemePreference("system", "dark")).toBe("dark");
    expect(resolveThemePreference("system", "light")).toBe("light");
    expect(resolveThemePreference("dark", "light")).toBe("dark");
  });

  it("keeps a stable storage key and German labels", () => {
    expect(THEME_PREFERENCE_STORAGE_KEY).toBe("cybersarah.theme-preference.v1");
    expect(themePreferenceLabel("dark")).toBe("Dunkel");
    expect(themePreferenceLabel("light")).toBe("Hell");
    expect(themePreferenceLabel("system")).toBe("System");
  });
});

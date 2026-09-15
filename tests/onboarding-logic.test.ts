/**
 * Sprint 117 — Onboarding: deterministische Tests der reinen Logik —
 * Abschluss-Flag, Slide-Reihenfolge, Schritt-Zustaende (Fortschritt,
 * Buttons), kuratierte Theme-Auswahl und Abschluss-Entscheidung.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_DESIGN_THEME, DESIGN_THEMES } from "@/lib/design-theme-logic";
import {
  clampOnboardingStepIndex,
  getOnboardingStepState,
  getOnboardingThemeChoices,
  normalizeOnboardingCompletion,
  normalizeOnboardingDesignTheme,
  ONBOARDING_SLIDES,
  ONBOARDING_THEME_CHOICES,
  shouldCompleteOnboarding,
} from "@/lib/onboarding-logic";
import { normalizeThemePreference, themePreferenceLabel } from "@/lib/theme-preference-logic";

describe("Sprint 117: Abschluss-Flag", () => {
  it('nur exakt "true" gilt als abgeschlossen — keine Guess-Logik', () => {
    expect(normalizeOnboardingCompletion("true")).toBe(true);
    expect(normalizeOnboardingCompletion(true)).toBe(true);
    expect(normalizeOnboardingCompletion("false")).toBe(false);
    expect(normalizeOnboardingCompletion("yes")).toBe(false);
    expect(normalizeOnboardingCompletion(null)).toBe(false);
    expect(normalizeOnboardingCompletion(undefined)).toBe(false);
  });
});

describe("Sprint 117: Slides und Schritt-Zustaende", () => {
  it("drei feste Slides: Begruessung, Workspace, Theme-Auswahl (in dieser Reihenfolge)", () => {
    expect(ONBOARDING_SLIDES.map((slide) => slide.id)).toEqual(["welcome", "workspace", "theme"]);
    expect(ONBOARDING_SLIDES.every((slide) => slide.title.length > 0 && slide.text.length > 0)).toBe(true);
  });

  it("erster Schritt: kein Zurueck, Fortschritt 0, Label 'Weiter'", () => {
    const state = getOnboardingStepState(0);
    expect(state.isFirst).toBe(true);
    expect(state.isLast).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.nextLabel).toBe("Weiter");
    expect(state.slide.id).toBe("welcome");
  });

  it("letzter Schritt: 'Los geht's', Fortschritt 1, Theme-Slide", () => {
    const state = getOnboardingStepState(2);
    expect(state.isLast).toBe(true);
    expect(state.progress).toBe(1);
    expect(state.nextLabel).toBe("Los geht's");
    expect(state.slide.id).toBe("theme");
  });

  it("ungueltige Indizes werden geclampt statt abzustuerzen", () => {
    expect(clampOnboardingStepIndex(-5, 3)).toBe(0);
    expect(clampOnboardingStepIndex(99, 3)).toBe(2);
    expect(clampOnboardingStepIndex(Number.NaN, 3)).toBe(0);
    expect(clampOnboardingStepIndex(1, 0)).toBe(0);
    expect(getOnboardingStepState(-1).slide.id).toBe("welcome");
    expect(getOnboardingStepState(42).slide.id).toBe("theme");
  });

  it("Ein-Slide-Flow hat Fortschritt 1 und ist erster und letzter Schritt", () => {
    const state = getOnboardingStepState(0, [ONBOARDING_SLIDES[0]]);
    expect(state.progress).toBe(1);
    expect(state.isFirst && state.isLast).toBe(true);
  });
});

describe("Sprint 117: kuratierte Theme-Auswahl", () => {
  it("drei unterscheidbare Designs, alle aus der Registry (Sprint 128 Design-Kuration)", () => {
    const choices = getOnboardingThemeChoices();
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((choice) => choice.theme)).size).toBe(3);
    for (const choice of choices) {
      expect(DESIGN_THEMES).toContain(choice.theme);
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.description.length).toBeGreaterThan(0);
    }
  });

  it("Standard-Design steht an erster Stelle der Auswahl", () => {
    expect(ONBOARDING_THEME_CHOICES[0]).toBe(DEFAULT_DESIGN_THEME);
    expect(getOnboardingThemeChoices()[0].theme).toBe(DEFAULT_DESIGN_THEME);
  });

  it("unbekannte Design-Waelse faellen auf das Standard-Design zurueck", () => {
    expect(normalizeOnboardingDesignTheme("aurora", DEFAULT_DESIGN_THEME)).toBe(DEFAULT_DESIGN_THEME); // Sprint 128: entferntes Theme faellt auf Standard
    expect(normalizeOnboardingDesignTheme("halluzination", DEFAULT_DESIGN_THEME)).toBe(DEFAULT_DESIGN_THEME);
    expect(normalizeOnboardingDesignTheme(42, DEFAULT_DESIGN_THEME)).toBe(DEFAULT_DESIGN_THEME);
  });
});

describe("Sprint 117: Praeferenz-Auswahl (Theme-Präferenz)", () => {
  it("Praeferenz-Normalisierung und Labels", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("unsinn")).toBe("system");
    expect(themePreferenceLabel("system")).toBe("System");
    expect(themePreferenceLabel("light")).toBe("Hell");
    expect(themePreferenceLabel("dark")).toBe("Dunkel");
  });
});

describe("Sprint 117: Abschluss-Entscheidung", () => {
  it("Abschluss nur auf dem letzten Schritt MIT Design-Wahl", () => {
    expect(shouldCompleteOnboarding(true, true)).toBe(true);
    expect(shouldCompleteOnboarding(true, false)).toBe(false);
    expect(shouldCompleteOnboarding(false, true)).toBe(false);
    expect(shouldCompleteOnboarding(false, false)).toBe(false);
  });
});

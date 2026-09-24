/**
 * Sprint 294 — Tests fuer EN-Sprach-Toggle (i18n).
 */
import { describe, it, expect } from "vitest";
import {
  type AppLanguage,
  type I18nKey,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  toggleLanguage,
  languageDisplayName,
  languageFlag,
  toggleButtonLabel,
  translate,
  createTranslator,
  isSupportedLanguage,
  getLanguageOptions,
} from "@/lib/i18n-language-logic";

describe("Sprint 294 — i18n Language Logic", () => {
  describe("normalizeLanguage", () => {
    it("returns 'de' for valid 'de'", () => {
      expect(normalizeLanguage("de")).toBe("de");
    });
    it("returns 'en' for valid 'en'", () => {
      expect(normalizeLanguage("en")).toBe("en");
    });
    it("falls back to default for invalid string", () => {
      expect(normalizeLanguage("fr")).toBe(DEFAULT_LANGUAGE);
    });
    it("falls back to default for null/undefined", () => {
      expect(normalizeLanguage(null)).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    });
    it("falls back to default for numbers", () => {
      expect(normalizeLanguage(42)).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe("toggleLanguage", () => {
    it("toggles DE to EN", () => {
      expect(toggleLanguage("de")).toBe("en");
    });
    it("toggles EN to DE", () => {
      expect(toggleLanguage("en")).toBe("de");
    });
  });

  describe("languageDisplayName", () => {
    it("returns 'Deutsch' for 'de'", () => {
      expect(languageDisplayName("de")).toBe("Deutsch");
    });
    it("returns 'English' for 'en'", () => {
      expect(languageDisplayName("en")).toBe("English");
    });
  });

  describe("languageFlag", () => {
    it("returns German flag for 'de'", () => {
      expect(languageFlag("de")).toBe("🇩🇪");
    });
    it("returns UK flag for 'en'", () => {
      expect(languageFlag("en")).toBe("🇬🇧");
    });
  });

  describe("toggleButtonLabel", () => {
    it("returns English label when DE is active", () => {
      expect(toggleButtonLabel("de")).toBe("Switch to English");
    });
    it("returns German label when EN is active", () => {
      expect(toggleButtonLabel("en")).toBe("Zur Deutsch wechseln");
    });
  });

  describe("translate", () => {
    it("translates a key in German", () => {
      expect(translate("de", "tab.dashboard")).toBe("Dashboard");
      expect(translate("de", "settings.logout")).toBe("Abmelden");
    });
    it("translates a key in English", () => {
      expect(translate("en", "settings.logout")).toBe("Sign out");
      expect(translate("en", "tab.settings")).toBe("Settings");
    });
    it("falls back to DE dict for unknown lang entries", () => {
      expect(translate("de", "common.save")).toBe("Speichern");
      expect(translate("en", "common.save")).toBe("Save");
    });
  });

  describe("createTranslator", () => {
    it("creates a function that translates in the given language", () => {
      const tDe = createTranslator("de");
      const tEn = createTranslator("en");
      expect(tDe("common.loading")).toBe("Laden...");
      expect(tEn("common.loading")).toBe("Loading...");
    });
  });

  describe("isSupportedLanguage", () => {
    it("returns true for 'de' and 'en'", () => {
      expect(isSupportedLanguage("de")).toBe(true);
      expect(isSupportedLanguage("en")).toBe(true);
    });
    it("returns false for unsupported", () => {
      expect(isSupportedLanguage("fr")).toBe(false);
      expect(isSupportedLanguage("")).toBe(false);
    });
  });

  describe("SUPPORTED_LANGUAGES", () => {
    it("contains 'de' and 'en'", () => {
      expect(SUPPORTED_LANGUAGES).toContain("de");
      expect(SUPPORTED_LANGUAGES).toContain("en");
      expect(SUPPORTED_LANGUAGES.length).toBe(2);
    });
  });

  describe("getLanguageOptions", () => {
    it("returns both languages with metadata", () => {
      const opts = getLanguageOptions();
      expect(opts.length).toBe(2);
      expect(opts[0].lang).toBe("de");
      expect(opts[0].label).toBe("Deutsch");
      expect(opts[0].flag).toBe("🇩🇪");
      expect(opts[1].lang).toBe("en");
      expect(opts[1].label).toBe("English");
      expect(opts[1].flag).toBe("🇬🇧");
    });
  });

  describe("dictionary completeness", () => {
    const keys: I18nKey[] = [
      "app.title", "app.tagline", "tab.dashboard", "tab.chat", "tab.workspace",
      "tab.media", "tab.settings", "chat.placeholder", "chat.empty.title",
      "chat.empty.subtitle", "chat.empty.starter1", "chat.empty.starter2",
      "chat.empty.starter3", "chat.empty.starter4", "settings.language",
      "settings.theme", "settings.account", "settings.logout",
      "onboarding.welcome.title", "onboarding.welcome.text",
      "onboarding.workspace.title", "onboarding.workspace.text",
      "onboarding.theme.title", "onboarding.theme.text", "onboarding.next",
      "onboarding.finish", "onboarding.step1", "onboarding.step2", "onboarding.step3",
      "error.fallback.title", "error.fallback.text", "error.retry", "error.home",
      "template.title", "template.category.all", "template.category.blank",
      "template.category.dashboard", "template.category.chat", "template.category.media",
      "common.loading", "common.cancel", "common.confirm", "common.save",
    ];
    it("DE and EN dictionaries have all keys", () => {
      for (const key of keys) {
        expect(translate("de", key)).not.toBe(key);
        expect(translate("en", key)).not.toBe(key);
      }
    });
  });
});

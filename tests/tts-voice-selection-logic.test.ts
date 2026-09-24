/**
 * Sprint 305 — Tests fuer Stimmenauswahl pro Projekt.
 */
import { describe, it, expect } from "vitest";
import {
  VOICE_CATALOG,
  selectVoice,
  validatePreviewText,
  buildPreviewCacheKey,
  formatVoiceLabel,
} from "@/lib/tts-voice-selection-logic";
import { TTS_VOICES, TTS_LIMITS } from "@/lib/tts-logic";

describe("Sprint 305 — TTS Voice Selection Logic", () => {
  it("Katalog deckt alle whitelisted Stimmen ab", () => {
    expect(VOICE_CATALOG.map((v) => v.id).sort()).toEqual([...TTS_VOICES].sort());
  });

  it("Katalog hat mindestens je eine weibliche und maennliche Stimme", () => {
    expect(VOICE_CATALOG.some((v) => v.gender === "female")).toBe(true);
    expect(VOICE_CATALOG.some((v) => v.gender === "male")).toBe(true);
  });

  it("bevorzugt explizite Stimmen-Id vor Geschlecht vor Default", () => {
    expect(selectVoice({ preferredVoiceId: "de-DE-ConradNeural" }).id).toBe("de-DE-ConradNeural");
    expect(selectVoice({ preferredGender: "male" }).gender).toBe("male");
    expect(selectVoice({}).id).toBe(VOICE_CATALOG[0].id);
  });

  it("ignoriert unbekannte Ids ehrlich (faellt auf Geschlecht/Default)", () => {
    expect(selectVoice({ preferredVoiceId: "gibts-nicht" }).id).toBe(VOICE_CATALOG[0].id);
  });

  it("validiert Vorschau-Text nach TTS-Grenzen", () => {
    expect(validatePreviewText("Hallo Welt").ok).toBe(true);
    expect(validatePreviewText("   ").ok).toBe(false);
    const tooLong = "x".repeat(TTS_LIMITS.text.max + 1);
    const r = validatePreviewText(tooLong);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("zu lang");
  });

  it("Cache-Key ist deterministisch (Stimme + Text)", () => {
    const a = buildPreviewCacheKey("de-DE-KatjaNeural", "Test");
    expect(a).toBe(buildPreviewCacheKey("de-DE-KatjaNeural", "Test"));
    expect(a).not.toBe(buildPreviewCacheKey("de-DE-ConradNeural", "Test"));
    expect(a.startsWith("tts-preview:de-DE-KatjaNeural:")).toBe(true);
  });

  it("formatVoiceLabel enthaelt Name, Geschlecht und Beschreibung", () => {
    const label = formatVoiceLabel(VOICE_CATALOG[0]);
    expect(label).toContain(VOICE_CATALOG[0].displayName);
    expect(label).toContain("weiblich");
  });
});

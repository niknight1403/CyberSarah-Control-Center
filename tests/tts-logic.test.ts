import { describe, expect, it } from "vitest";

import {
  DEFAULT_TTS_VOICE,
  TTS_VOICES,
  buildTtsCacheKey,
  synthesizeSpeechWithCache,
  validateTtsRequest,
  type TtsCacheAdapter,
  type TtsCacheEntry,
  type TtsProvider,
} from "../lib/tts-logic";

function memoryCache(): TtsCacheAdapter & { data: Map<string, TtsCacheEntry> } {
  const data = new Map<string, TtsCacheEntry>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, entry) => { data.set(key, entry); },
  };
}

function fakeProvider(mp3: Buffer = Buffer.from("fake-mp3")): TtsProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    synthesize: async (text, voice) => {
      calls.push(`${voice}:${text}`);
      return { ok: true, mp3 };
    },
  };
}

describe("TTS-Validierung (Sprint 272)", () => {
  it("lehnt leeren und zu langen Text ab", () => {
    expect(validateTtsRequest({ text: "   " }).valid).toBe(false);
    expect(validateTtsRequest({ text: "x".repeat(1501) }).valid).toBe(false);
  });

  it("lehnt Stimmen außerhalb der Whitelist ab", () => {
    const result = validateTtsRequest({ text: "Hallo Welt", voice: "en-US-GuyNeural" });
    expect(result.valid).toBe(false);
  });

  it("akzeptiert deutschen Text mit Default-Stimme", () => {
    const result = validateTtsRequest({ text: "Hallo Welt", voice: undefined });
    expect(result).toEqual({ valid: true, text: "Hallo Welt", voice: DEFAULT_TTS_VOICE });
  });
});

describe("TTS-Cache-Orchestrierung (Sprint 272)", () => {
  it("liefert identischen Text nur einmal vom Provider und markiert den Cache", async () => {
    const cache = memoryCache();
    const provider = fakeProvider();
    const first = await synthesizeSpeechWithCache({ text: "Gleicher Text", voice: DEFAULT_TTS_VOICE }, { cache, provider });
    const second = await synthesizeSpeechWithCache({ text: "Gleicher Text", voice: DEFAULT_TTS_VOICE }, { cache, provider });

    expect(first.ok).toBe(true);
    if (first.ok) expect(first.source).toBe("provider");
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.source).toBe("cache");
      expect(second.base64Mp3).toBe(first.ok ? first.base64Mp3 : "");
    }
    expect(provider.calls.length).toBe(1);
  });

  it("übergibt Fehler des Providers ehrlich weiter", async () => {
    const cache = memoryCache();
    const provider: TtsProvider = {
      synthesize: async () => ({ ok: false, reason: "Edge nicht erreichbar" }),
    };
    const result = await synthesizeSpeechWithCache({ text: "Test", voice: DEFAULT_TTS_VOICE }, { cache, provider });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Edge nicht erreichbar");
  });

  it("baut deterministische Cache-Schlüssel", () => {
    expect(buildTtsCacheKey({ text: "A", voice: DEFAULT_TTS_VOICE })).toBe(buildTtsCacheKey({ text: "A", voice: DEFAULT_TTS_VOICE }));
    expect(buildTtsCacheKey({ text: "A", voice: DEFAULT_TTS_VOICE })).not.toBe(buildTtsCacheKey({ text: "B", voice: DEFAULT_TTS_VOICE }));
  });

  it("kennt nur whitelisted Stimmen und einen Default", () => {
    expect(TTS_VOICES).toContain(DEFAULT_TTS_VOICE);
    expect(TTS_VOICES.length).toBeGreaterThan(0);
  });
});

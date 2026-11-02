import { describe, it, expect } from "vitest";
import {
  buildMotifPrompt,
  buildMotifRequest,
  buildTtsRequest,
  explainMissingVoice,
  parseMotifImage,
  parseTtsAudio,
  pcm16ToWav,
  resolveImageKeys,
  resolveVoiceTarget,
  resolveVoiceTargets,
  retryDelayMs,
  shouldRetryStatus,
} from "../lib/ai-influenza-voice-logic";

const GEMINI_TARGET = { provider: "gemini" as const, apiKey: "g-key", voice: "Kore", model: "gemini-2.5-flash-preview-tts" };
const OPENAI_TARGET = { provider: "openai" as const, apiKey: "o-key", voice: "nova", model: "tts-1" };

const PCM = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
const PCM_B64 = PCM.toString("base64");

function geminiAudioPayload(data: string, mimeType = "audio/L16;rate=24000") {
  return { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }] };
}

describe("resolveVoiceTarget", () => {
  it("bevorzugt Gemini, weil derselbe Schluessel auch Motive liefert", () => {
    const target = resolveVoiceTarget({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o" });
    expect(target?.provider).toBe("gemini");
    expect(target?.voice).toBe("Kore");
  });

  it("faellt auf OpenAI zurueck", () => {
    expect(resolveVoiceTarget({ OPENAI_API_KEY: "o" })?.provider).toBe("openai");
  });

  it("liefert null ohne Schluessel und ignoriert leere Werte", () => {
    expect(resolveVoiceTarget({})).toBeNull();
    expect(resolveVoiceTarget({ GEMINI_API_KEY: "   ", OPENAI_API_KEY: "" })).toBeNull();
  });
});

describe("buildTtsRequest", () => {
  it("verlangt bei Gemini die Audio-Modalitaet und die Stimme", () => {
    const req = buildTtsRequest(GEMINI_TARGET, "  Hallo Welt  ");
    const body = JSON.parse(req.body);
    expect(req.url).toContain("gemini-2.5-flash-preview-tts:generateContent");
    expect(req.headers["x-goog-api-key"]).toBe("g-key");
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
    expect(body.contents[0].parts[0].text).toBe("Hallo Welt");
  });

  it("verlangt bei OpenAI MP3 mit Bearer-Token", () => {
    const req = buildTtsRequest(OPENAI_TARGET, "Hallo Welt");
    const body = JSON.parse(req.body);
    expect(req.headers.Authorization).toBe("Bearer o-key");
    expect(body.response_format).toBe("mp3");
    expect(body.voice).toBe("nova");
  });

  it("verweigert leeren Text", () => {
    expect(() => buildTtsRequest(GEMINI_TARGET, "   ")).toThrow(/Ohne Text/);
  });
});

describe("parseTtsAudio", () => {
  it("erkennt rohes PCM von Gemini samt Abtastrate", () => {
    const audio = parseTtsAudio(GEMINI_TARGET, geminiAudioPayload(PCM_B64, "audio/L16;rate=24000"));
    expect(audio?.container).toBe("pcm16");
    expect(audio?.sampleRate).toBe(24000);
    expect(audio?.bytes.equals(PCM)).toBe(true);
  });

  it("erkennt MP3 von Gemini, falls der Anbieter komprimiert liefert", () => {
    const audio = parseTtsAudio(GEMINI_TARGET, geminiAudioPayload(PCM_B64, "audio/mp3"));
    expect(audio?.container).toBe("mp3");
  });

  it("verwirft Fehlerpakete ohne Audiodaten", () => {
    expect(parseTtsAudio(GEMINI_TARGET, null)).toBeNull();
    expect(parseTtsAudio(GEMINI_TARGET, { candidates: [{ content: { parts: [{ text: "blockiert" }] } }] })).toBeNull();
    expect(parseTtsAudio(GEMINI_TARGET, { error: { message: "quota" } })).toBeNull();
  });

  it("nimmt bei OpenAI nur echte Bytes", () => {
    expect(parseTtsAudio(OPENAI_TARGET, { __bytes: new Uint8Array([1, 2, 3]) })?.container).toBe("mp3");
    expect(parseTtsAudio(OPENAI_TARGET, { __bytes: new Uint8Array([]) })).toBeNull();
  });
});

describe("pcm16ToWav", () => {
  it("schreibt einen gueltigen WAV-Kopf", () => {
    const wav = pcm16ToWav(PCM, 24000, 1);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
    expect(wav.readUInt32LE(4)).toBe(36 + PCM.length);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(PCM.length);
    expect(wav.length).toBe(44 + PCM.length);
  });

  it("rechnet die Datenrate aus Kanaelen und Abtastrate", () => {
    const wav = pcm16ToWav(PCM, 48000, 2);
    expect(wav.readUInt32LE(28)).toBe(48000 * 4);
    expect(wav.readUInt16LE(32)).toBe(4);
  });

  it("verweigert leeres PCM", () => {
    expect(() => pcm16ToWav(Buffer.alloc(0))).toThrow(/Leeres PCM/);
  });
});

describe("buildMotifPrompt", () => {
  it("nimmt die Bildidee der Szene auf", () => {
    const prompt = buildMotifPrompt({ visual: "Kalender mit geplanten Posts", sceneIndex: 1, packageName: "Growth" });
    expect(prompt).toContain("Kalender mit geplanten Posts");
    expect(prompt).toContain("Szene 2");
    expect(prompt).toContain("Growth");
    expect(prompt).toContain("9:16");
  });

  it("bleibt auch ohne Bildidee verwendbar und haelt Text aus dem Bild", () => {
    const prompt = buildMotifPrompt({ visual: null, sceneIndex: 0, packageName: "Starter" });
    expect(prompt).toContain("abstrakte Bewegungsstudie");
    expect(prompt).toContain("kein Text im Bild");
  });
});

describe("buildMotifRequest und parseMotifImage", () => {
  it("verlangt einen Schluessel", () => {
    expect(() => buildMotifRequest("  ", "Motiv")).toThrow(/Ohne Schluessel/);
  });

  it("liest nur Bildteile", () => {
    const withImage = {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PCM_B64 } }] } }],
    };
    expect(parseMotifImage(withImage)?.equals(PCM)).toBe(true);
    const audioOnly = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16", data: PCM_B64 } }] } }] };
    expect(parseMotifImage(audioOnly)).toBeNull();
    expect(parseMotifImage({})).toBeNull();
  });
});

describe("explainMissingVoice", () => {
  it("nennt den fehlenden Schluessel beim Namen", () => {
    expect(explainMissingVoice({})).toContain("GEMINI_API_KEY");
    expect(explainMissingVoice({ GEMINI_API_KEY: "g" })).toContain("keine Audiodaten");
  });
});

describe("resolveVoiceTargets", () => {
  it("bildet die ganze Kette: Gemini, Reserve, OpenAI", () => {
    const targets = resolveVoiceTargets({
      GEMINI_API_KEY: "g1",
      GEMINI_BACKUP_KEY: "g2",
      OPENAI_BACKUP_KEY: "o1",
    });
    expect(targets.map((t) => `${t.provider}:${t.apiKey}`)).toEqual(["gemini:g1", "gemini:g2", "openai:o1"]);
  });

  it("nimmt keinen Schluessel doppelt", () => {
    const targets = resolveVoiceTargets({ GEMINI_API_KEY: "gleich", GEMINI_BACKUP_KEY: "gleich" });
    expect(targets).toHaveLength(1);
  });

  it("liefert eine leere Kette ohne Schluessel", () => {
    expect(resolveVoiceTargets({})).toEqual([]);
  });
});

describe("resolveImageKeys", () => {
  it("nutzt Haupt- und Reserveschluessel, ohne Doppelte", () => {
    expect(resolveImageKeys({ GEMINI_API_KEY: "a", GEMINI_BACKUP_KEY: "b" })).toEqual(["a", "b"]);
    expect(resolveImageKeys({ GEMINI_API_KEY: "a", GEMINI_BACKUP_KEY: "a" })).toEqual(["a"]);
    expect(resolveImageKeys({ OPENAI_API_KEY: "o" })).toEqual([]);
  });
});

describe("shouldRetryStatus", () => {
  it("wiederholt Kontingent und Serverfehler, aber nicht Fehlbedienung", () => {
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(503)).toBe(true);
    expect(shouldRetryStatus(400)).toBe(false);
    expect(shouldRetryStatus(401)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("wartet wachsend und respektiert Retry-After", () => {
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(1)).toBe(6000);
    expect(retryDelayMs(5)).toBe(14000);
    expect(retryDelayMs(0, 3)).toBe(3000);
    expect(retryDelayMs(0, 600)).toBe(30000);
  });
});

/**
 * AI Influenza Team — Stimme und Bildmotiv (Sprint 9b).
 *
 * Dieses Modul baut nur Anfragen und liest Antworten: kein Netzwerk, keine
 * Dateien. Damit ist die Verdrahtung testbar, und der Aufrufer entscheidet,
 * welcher Anbieter mit welchem Schluessel arbeitet.
 *
 * Regeln:
 * - Ohne Schluessel wird nichts erfunden: `resolveVoiceTarget` liefert null,
 *   der Aufrufer muss dann ehrlich auf Stille zurueckfallen und das vermerken.
 * - Antworten werden geprueft, bevor Bytes entstehen. Ein HTML-Fehlerpaket
 *   darf nie als Audiodatei durchgehen.
 */

export type VoiceProvider = "gemini" | "openai";

export type VoiceTarget = {
  provider: VoiceProvider;
  apiKey: string;
  voice: string;
  model: string;
};

export type HttpRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type SceneAudio = {
  bytes: Buffer;
  mime: string;
  /** Gemini liefert rohes PCM; der Aufrufer muss es noch in WAV packen. */
  container: "wav" | "mp3" | "pcm16";
  sampleRate: number;
  channels: number;
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_VOICE = "Kore";
const GEMINI_SAMPLE_RATE = 24000;
const OPENAI_TTS_MODEL = "tts-1";
const OPENAI_VOICE = "nova";

/**
 * Waehlt den Anbieter anhand der gesetzten Schluessel. Gemini zuerst, weil
 * derselbe Schluessel auch Bildmotive liefert; OpenAI nur als Rueckfall.
 */
export function resolveVoiceTarget(env: Record<string, string | undefined>): VoiceTarget | null {
  const gemini = env.GEMINI_API_KEY?.trim();
  if (gemini) {
    return { provider: "gemini", apiKey: gemini, voice: GEMINI_VOICE, model: GEMINI_TTS_MODEL };
  }
  const openai = env.OPENAI_API_KEY?.trim();
  if (openai) {
    return { provider: "openai", apiKey: openai, voice: OPENAI_VOICE, model: OPENAI_TTS_MODEL };
  }
  return null;
}

/** Anfrage fuer eine Szene. Text wird nie gekuerzt, nur getrimmt. */
export function buildTtsRequest(target: VoiceTarget, text: string): HttpRequest {
  const spoken = text.trim();
  if (spoken.length === 0) throw new Error("Ohne Text keine Vertonung.");

  if (target.provider === "gemini") {
    return {
      url: `${GEMINI_BASE}/${target.model}:generateContent`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": target.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: spoken }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: target.voice } } },
        },
      }),
    };
  }

  return {
    url: "https://api.openai.com/v1/audio/speech",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      voice: target.voice,
      input: spoken,
      response_format: "mp3",
    }),
  };
}

function decodeBase64Audio(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, "");
  // Kurze Nutzlast ist erlaubt (Test-Fixtures), fremde Zeichen nicht: so faellt
  // ein HTML- oder JSON-Fehlerpaket hier heraus statt als Audiodatei zu gelten.
  if (compact.length < 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const bytes = Buffer.from(compact, "base64");
  return bytes.length > 0 ? bytes : null;
}

/** Liest die Vertonung aus der Anbieter-Antwort; null heisst: keine Audiodaten. */
export function parseTtsAudio(target: VoiceTarget, payload: unknown): SceneAudio | null {
  const root = payload as Record<string, unknown> | null;
  if (!root || typeof root !== "object") return null;

  if (target.provider === "gemini") {
    const candidates = root.candidates as { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] | undefined;
    const part = candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData);
    const data = decodeBase64Audio(part?.inlineData?.data);
    if (!data) return null;
    const mime = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? GEMINI_SAMPLE_RATE);
    return {
      bytes: data,
      mime,
      container: /mp3|mpeg/i.test(mime) ? "mp3" : "pcm16",
      sampleRate: Number.isFinite(rate) && rate > 0 ? rate : GEMINI_SAMPLE_RATE,
      channels: 1,
    };
  }

  // OpenAI liefert MP3-Bytes direkt im Body; hier kommt schon dekodiertes Material an.
  const bytes = root.__bytes instanceof Uint8Array ? Buffer.from(root.__bytes) : null;
  if (!bytes || bytes.length === 0) return null;
  return { bytes, mime: "audio/mpeg", container: "mp3", sampleRate: 44100, channels: 1 };
}

/** WAV-Kopf fuer rohes PCM. Reine Rechnung, damit sie pruefbar ist. */
export function pcm16ToWav(pcm: Buffer, sampleRate = GEMINI_SAMPLE_RATE, channels = 1): Buffer {
  if (pcm.length === 0) throw new Error("Leeres PCM kann nicht verpackt werden.");
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Bildmotiv-Anfrage aus der Bildidee einer Szene. */
export function buildMotifPrompt(input: {
  visual: string | null;
  sceneIndex: number;
  packageName: string;
}): string {
  const idea = (input.visual ?? "").trim();
  const motif = idea.length > 0 ? idea : "abstrakte Bewegungsstudie zum Thema";
  return [
    `Vertikales 9:16-Motiv fuer ein Kurzvideo, Szene ${input.sceneIndex + 1}.`,
    `Motiv: ${motif}.`,
    `Marke: ${input.packageName}.`,
    "Stil: klare Cyan- und Magenta-Akzente auf dunklem Grund, ruhige Komposition,",
    "viel Freiraum in der unteren Bildhaelfte fuer Untertitel, kein Text im Bild,",
    "keine Logos, keine Gesichter im Vordergrund.",
  ].join(" ");
}

export function buildMotifRequest(apiKey: string, prompt: string): HttpRequest {
  if (!apiKey.trim()) throw new Error("Ohne Schluessel kein Motiv.");
  return {
    url: `${GEMINI_BASE}/${GEMINI_IMAGE_MODEL}:generateContent`,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  };
}

/** Liest das erzeugte Bild; null, wenn die Antwort kein Bild enthaelt. */
export function parseMotifImage(payload: unknown): Buffer | null {
  const root = payload as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] } | null;
  const parts = root?.candidates?.[0]?.content?.parts ?? [];
  const part = parts.find((entry) => entry.inlineData?.mimeType?.startsWith("image/"));
  return decodeBase64Audio(part?.inlineData?.data);
}

/** Kurzfassung fuer Meldungen: warum keine Vertonung entstand. */
export function explainMissingVoice(env: Record<string, string | undefined>): string {
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  const hasOpenai = Boolean(env.OPENAI_API_KEY?.trim());
  if (hasGemini || hasOpenai) return "Anbieter vorhanden, aber keine Audiodaten in der Antwort.";
  return "Kein GEMINI_API_KEY und kein OPENAI_API_KEY gesetzt — Vertonung bleibt Stille.";
}

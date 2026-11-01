/**
 * Sprint 272 — TTS-Logik (rein, testbar). Portiert aus projekt-nullpunkt
 * (server/media.ts, EdgeTtsProvider) — mit dem Unterschied, dass hier keine
 * Python-CLI (edge-tts) benoetigt wird, sondern der Node-Client msedge-tts
 * (WebSocket gegen Microsofts oeffentliche Edge-Endpunkte, kostenlos).
 *
 * Ehrlichkeits-Regeln:
 *   - TTS ist kostenfrei, aber nicht grenzenlos: Textlaenge und Cache sind
 *     begrenzt und werden erzwungen.
 *   - Ein Fehler beim Provider ist ein Fehler — kein stiller Ersatztext,
 *     keine leere Audio-Datei.
 *   - Antworten markieren ehrlich, ob Audio aus dem Cache kam.
 */

export const TTS_LIMITS = {
  text: { min: 1, max: 1500 },
  maxAudioBytes: 5 * 1024 * 1024,
  cacheMaxEntries: 80,
  maxDailySynthesesPerUser: 30,
} as const;

/** Kostenlose deutsche Microsoft-Edge-Stimmen (Whitelist, keine freie Eingabe). */
export const TTS_VOICES = ["de-DE-KatjaNeural", "de-DE-AmalaNeural", "de-DE-ConradNeural", "de-DE-FlorianApollNeural"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const DEFAULT_TTS_VOICE: TtsVoice = "de-DE-KatjaNeural";

export type TtsRequestInput = {
  text: string;
  voice?: string;
};

export type TtsRequestValidation =
  | { valid: true; text: string; voice: TtsVoice }
  | { valid: false; reason: string };

export function validateTtsRequest(input: TtsRequestInput): TtsRequestValidation {
  const text = input.text.trim();
  if (text.length < TTS_LIMITS.text.min) return { valid: false, reason: "Leerer Text kann nicht vorgelesen werden." };
  if (text.length > TTS_LIMITS.text.max) {
    return { valid: false, reason: `Text zu lang (${text.length}/${TTS_LIMITS.text.max} Zeichen) — kürzen und erneut senden.` };
  }
  const voice = (input.voice ?? DEFAULT_TTS_VOICE) as TtsVoice;
  if (!TTS_VOICES.includes(voice)) {
    return { valid: false, reason: `Stimme "${input.voice}" ist nicht in der Whitelist. Erlaubt: ${TTS_VOICES.join(", ")}.` };
  }
  return { valid: true, text, voice };
}

export function buildTtsCacheKey(input: { text: string; voice: TtsVoice }): string {
  // Deterministischer, kollisionsarmer Schluessel ohne Crypto-Abhaengigkeit im Hot Path.
  let hash = 2166136261;
  const payload = `${input.voice}::${input.text}`;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `tts:${(hash >>> 0).toString(36)}`;
}

export interface TtsCacheEntry {
  base64Mp3: string;
  bytes: number;
  createdAt: string;
}

export interface TtsCacheAdapter {
  get(key: string): Promise<TtsCacheEntry | null>;
  set(key: string, entry: TtsCacheEntry): Promise<void>;
}

export interface TtsProvider {
  synthesize(text: string, voice: TtsVoice): Promise<{ ok: true; mp3: Buffer } | { ok: false; reason: string }>;
}

export type TtsSynthesisResult =
  | { ok: true; source: "cache" | "provider"; base64Mp3: string; bytes: number; note: string }
  | { ok: false; reason: string; retryHint: string | null };

/** Orchestriert Synthese mit Cache — identischer Text liefert identisches Audio. */
export async function synthesizeSpeechWithCache(
  input: { text: string; voice: TtsVoice },
  deps: { cache: TtsCacheAdapter; provider: TtsProvider },
): Promise<TtsSynthesisResult> {
  const validation = validateTtsRequest({ text: input.text, voice: input.voice });
  if (!validation.valid) return { ok: false, reason: validation.reason, retryHint: null };

  const key = buildTtsCacheKey({ text: validation.text, voice: validation.voice });
  const cached = await deps.cache.get(key);
  if (cached && cached.base64Mp3) {
    return {
      ok: true,
      source: "cache",
      base64Mp3: cached.base64Mp3,
      bytes: cached.bytes,
      note: `Aus dem TTS-Cache (${cached.bytes} Bytes, Stimme ${validation.voice}).`,
    };
  }

  const fresh = await deps.provider.synthesize(validation.text, validation.voice);
  if (!fresh.ok) return { ok: false, reason: fresh.reason, retryHint: "Edge-TTS-Endpunkt kann vorübergehend gesperrt sein — später erneut versuchen." };
  if (fresh.mp3.byteLength === 0) return { ok: false, reason: "TTS-Provider lieferte leere Audio-Daten.", retryHint: "Erneut senden." };
  if (fresh.mp3.byteLength > TTS_LIMITS.maxAudioBytes) {
    return { ok: false, reason: "Audio überschreitet die Größenobergrenze.", retryHint: "Text kürzen." };
  }
  const base64Mp3 = fresh.mp3.toString("base64");
  await deps.cache.set(key, { base64Mp3, bytes: fresh.mp3.byteLength, createdAt: new Date().toISOString() });
  return {
    ok: true,
    source: "provider",
    base64Mp3,
    bytes: fresh.mp3.byteLength,
    note: `Frisch synthetisiert mit ${validation.voice} (${fresh.mp3.byteLength} Bytes, Edge-TTS, kostenlos).`,
  };
}

/**
 * Sprint 272 — TTS-Server-Modul: Edge-TTS (msedge-tts, Node-Client) mit
 * KV-Cache über die bestehende Settings-Tabelle.
 *
 * Ehrlichkeits-Regeln im Betrieb:
 *   - Ohne erreichbaren Edge-Endpunkt heißt es ehrlich "fehlgeschlagen",
 *     nie eine stille Dummy-Audio.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as db from "./db";
import {
  DEFAULT_TTS_VOICE,
  synthesizeSpeechWithCache,
  type TtsCacheAdapter,
  type TtsCacheEntry,
  type TtsProvider,
  type TtsSynthesisResult,
  type TtsVoice,
} from "../lib/tts-logic";

const CACHE_KEY_PREFIX = "tts.cache.";

function kvCacheAdapter(): TtsCacheAdapter {
  return {
    get: async (key) => {
      const entry = await db.getModelRouterSetting<TtsCacheEntry>(`${CACHE_KEY_PREFIX}${key}`);
      return entry ?? null;
    },
    set: async (key, entry) => {
      await db.setModelRouterSetting(`${CACHE_KEY_PREFIX}${key}`, entry);
    },
  };
}

/** Der echte Provider: schreibt in ein Temp-Verzeichnis und liest die Datei zurück. */
class MsEdgeTtsProvider implements TtsProvider {
  async synthesize(text: string, voice: TtsVoice): Promise<{ ok: true; mp3: Buffer } | { ok: false; reason: string }> {
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const dir = await mkdtemp(path.join(tmpdir(), "cybersarah-tts-"));
      try {
        const { audioFilePath } = await tts.toFile(dir, text);
        const mp3 = await readFile(audioFilePath);
        await tts.close();
        if (mp3.byteLength === 0) return { ok: false, reason: "Edge-TTS lieferte leere Audio-Daten." };
        return { ok: true, mp3 };
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch (error) {
      return {
        ok: false,
        reason: `Edge-TTS-Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
      };
    }
  }
}

export async function synthesizeSpeech(
  text: string,
  voice: TtsVoice = DEFAULT_TTS_VOICE,
): Promise<TtsSynthesisResult> {
  return synthesizeSpeechWithCache({ text, voice }, { cache: kvCacheAdapter(), provider: new MsEdgeTtsProvider() });
}

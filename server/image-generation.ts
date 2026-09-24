/**
 * Sprint 264 — Bild-Generierungs-Server: FLUX.1-schnell via HuggingFace
 * (Free-Tier), begrenzter KV-Cache, Tagesquote pro Nutzer, Freigabe-Pflicht.
 *
 * Ehrlichkeits-Regeln im Betrieb:
 *   - Ohne HF_TOKEN heisst es "nicht konfiguriert", nie ein Dummy-Bild.
 *   - Ein Provider-Fehler wird als solcher gemeldet; kein stiller Ersatz.
 *   - Antwort enthaelt immer, ob das Bild aus dem Cache kam.
 */

import * as db from "./db";
import {
  DEFAULT_HF_BASE_URL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_LIMITS,
  buildImageCacheKey,
  generateImageWithCache,
  type ImageCacheAdapter,
  type ImageCacheEntry,
  type ImageSize,
} from "../lib/image-generation-logic";

const CACHE_KEY_PREFIX = "imagegen.cache.";

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function kvCacheAdapter(): ImageCacheAdapter {
  return {
    get: async (key) => {
      const entry = await db.getModelRouterSetting<ImageCacheEntry>(`${CACHE_KEY_PREFIX}${key}`);
      return entry ?? null;
    },
    set: async (key, entry) => {
      await db.setModelRouterSetting(`${CACHE_KEY_PREFIX}${key}`, entry);
    },
    keys: async () => {
      throw new Error("keys werden nur im Begrenzungs-Lauf benoetigt");
    },
    remove: async (key) => {
      await db.setModelRouterSetting(`${CACHE_KEY_PREFIX}${key}`, null);
    },
  };
}

export type GenerateImageResult =
  | { ok: true; source: "cache" | "provider"; dataUrl: string; note: string }
  | { ok: false; reason: string; retryHint: string | null; configured: boolean };

async function fetchFromHuggingFace(
  prompt: string,
  model: string,
  size: ImageSize,
  seed: number | null,
): Promise<{ ok: true; imageKey: string; note: string; dataUrl: string | null } | { ok: false; reason: string }> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) return { ok: false, reason: "HF_TOKEN ist nicht konfiguriert — Bild-Generierung ist ohne Schlüssel ehrlich nicht verfügbar." };
  const baseUrl = (process.env.HF_BASE_URL?.trim() || DEFAULT_HF_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/${model}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
      body: JSON.stringify({ inputs: prompt, parameters: seed === null ? {} : { seed } }),
      signal: AbortSignal.timeout(60_000),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 120);
      return { ok: false, reason: `HuggingFace antwortete ${response.status}: ${text || "ohne Nachricht"}` };
    }
    if (buffer.byteLength === 0) return { ok: false, reason: "HuggingFace lieferte ein leeres Bild." };
    if (buffer.byteLength > IMAGE_LIMITS.maxImageBytes) return { ok: false, reason: "Bild überschreitet die Größenobergrenze." };
    return {
      ok: true,
      imageKey: `hf:${buffer.byteLength}:${buildImageCacheKey({ prompt, model, size, seed }).slice(-24)}`,
      note: `Erzeugt via ${model} (Free-Tier), ${Math.round(buffer.byteLength / 1024)} KB.`,
      dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    };
  } catch (error) {
    return { ok: false, reason: `HuggingFace-Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}` };
  }
}

async function checkAndConsumeDailyQuota(openId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = `imagegen.usage.${dayKey()}.${openId}`;
  const used = (await db.getModelRouterSetting<number>(key)) ?? 0;
  if (used >= IMAGE_LIMITS.maxDailyImagesPerUser) {
    return { ok: false, reason: `Tageslimit für Bilder erreicht (${used}/${IMAGE_LIMITS.maxDailyImagesPerUser}) — resetzt nächste UTC-Mitternacht.` };
  }
  await db.setModelRouterSetting(key, used + 1);
  return { ok: true };
}

export async function generateImageForUser(
  openId: string,
  input: { prompt: string; size?: ImageSize; seed?: number | null; approved: boolean },
): Promise<GenerateImageResult> {
  const configured = Boolean(process.env.HF_TOKEN?.trim());
  if (!input.approved) {
    return { ok: false, reason: "Bild-Generierung braucht deine ausdrückliche Freigabe — kein Auto-Render.", retryHint: null, configured };
  }
  const quota = await checkAndConsumeDailyQuota(openId);
  if (!quota.ok) return { ok: false, reason: quota.reason, retryHint: null, configured };

  const result = await generateImageWithCache(
    { prompt: input.prompt, model: DEFAULT_IMAGE_MODEL, size: input.size, seed: input.seed },
    {
      cache: kvCacheAdapter(),
      fetchFromProvider: async (prompt, model, size, seed) => fetchFromHuggingFace(prompt, model, size, seed),
    },
  );

  if (!result.ok) {
    return { ok: false, reason: result.reason, retryHint: result.retryHint, configured };
  }
  if (!result.dataUrl) {
    return { ok: false, reason: "Bild erzeugt, aber Bytes fehlen — ehrlich ein Fehler, kein Dummy.", retryHint: "Erneut senden.", configured };
  }
  return { ok: true, source: result.source, dataUrl: result.dataUrl, note: result.note };
}

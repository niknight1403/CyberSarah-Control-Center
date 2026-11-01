/**
 * Sprint 264 — Bild-Generierungs-Logik (rein, testbar). Portiert aus
 * projekt-nullpunkt: provider-agnostischer Adapter, Free-Tier-Standard
 * (FLUX.1-schnell via HuggingFace), plus Nullpunkts Sicherheitsgrenzen.
 *
 * Ehrlichkeits-Regeln:
 *   - Nur synthetische Inhalte: Prompts zu realen Personen, Deepfakes,
 *     Minderjaehrigen oder expliziten Inhalten werden VOR dem Aufruf abgelehnt.
 *   - Jedes Ergebnis wird geliefert wie es ist: ein Fehlschlag ist ein
 *     Fehlschlag, kein stiller Austausch gegen ein anderes Bild.
 *   - Der Cache ist ein Kosten- und Geschwindigkeitswerkzeug: identische
 *     Anfragen bekommen das identische Bild — und der Cache-Eintrag ist
 *     als solcher sichtbar.
 */

export const IMAGE_LIMITS = {
  prompt: { min: 5, max: 600 },
  maxDailyImagesPerUser: 25,
  cacheMaxEntries: 120,
  maxImageBytes: 8 * 1024 * 1024,
} as const;

export const DEFAULT_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
export const DEFAULT_HF_BASE_URL = "https://router.huggingface.co/hf-inference/models";

export const IMAGE_SIZES = ["square", "landscape", "portrait"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export type ImageSafetyRejection =
  | { safe: true }
  | { safe: false; reason: string };

export function validateImagePromptSafety(prompt: string): ImageSafetyRejection {
  const normalized = prompt.toLowerCase();
  if (/\b(nsfw|porn\w*|nackt|nude|sex\w*|erotisch|explicit)\b/.test(normalized)) {
    return { safe: false, reason: "Explizite oder erotische Inhalte werden nicht erzeugt — klare Grenze, kein Ausnahmekanal." };
  }
  if (/\b(minderj\S*|underage|child|kind|kinder\w*|teen\w*)\b/.test(normalized)) {
    return { safe: false, reason: "Prompts mit Bezug auf Minderjährige werden abgelehnt." };
  }
  if (/\b(deepfake|face swap|gesicht von|face of|likeness of)\b/.test(normalized)) {
    return { safe: false, reason: "Gesichter/Ähnlichkeiten realer Personen werden nicht erzeugt — keine Deepfakes." };
  }
  if (/\b(als|as)\s+(realperson|echte person|celebrity|prominente?n?)\b/.test(normalized)) {
    return { safe: false, reason: "Reale Personen als Vorlage sind nicht erlaubt — nur synthetische Inhalte." };
  }
  return { safe: true };
}

export type ImageRequestInput = {
  prompt: string;
  size?: ImageSize;
  seed?: number | null;
};

export type ImageRequestValidation =
  | { valid: true; prompt: string; size: ImageSize; seed: number | null }
  | { valid: false; reason: string };

export function validateImageRequest(input: ImageRequestInput): ImageRequestValidation {
  const prompt = input.prompt.trim();
  if (prompt.length < IMAGE_LIMITS.prompt.min || prompt.length > IMAGE_LIMITS.prompt.max) {
    return { valid: false, reason: `Der Prompt braucht ${IMAGE_LIMITS.prompt.min}–${IMAGE_LIMITS.prompt.max} Zeichen.` };
  }
  const safety = validateImagePromptSafety(prompt);
  if (!safety.safe) return { valid: false, reason: safety.reason };
  const size = input.size ?? "square";
  if (!IMAGE_SIZES.includes(size)) return { valid: false, reason: "Unbekannte Bildgröße." };
  const seed = typeof input.seed === "number" && Number.isFinite(input.seed) && input.seed >= 0 ? Math.floor(input.seed) : null;
  return { valid: true, prompt, size, seed };
}

export function buildImageCacheKey(request: { prompt: string; model: string; size: ImageSize; seed: number | null }): string {
  const seedPart = request.seed === null ? "auto" : String(request.seed);
  return `img:${request.model}:${request.size}:${seedPart}:${hashString(`${request.prompt.trim().toLowerCase()}`)}`;
}

export function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function pixelHint(size: ImageSize): { width: number; height: number } {
  switch (size) {
    case "landscape": return { width: 1280, height: 768 };
    case "portrait": return { width: 768, height: 1280 };
    case "square": return { width: 1024, height: 1024 };
  }
}

export type ImageCacheEntry = { key: string; model: string; prompt: string; createdAt: number; imageKey: string; byteSize: number; dataUrl: string | null };

export type ImageCacheAdapter = {
  get(key: string): Promise<ImageCacheEntry | null>;
  set(key: string, entry: ImageCacheEntry): Promise<void>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
};

export async function cacheImage(adapter: ImageCacheAdapter, entry: ImageCacheEntry): Promise<number> {
  await adapter.set(entry.key, entry);
  const keys = await adapter.keys();
  if (keys.length <= IMAGE_LIMITS.cacheMaxEntries) return keys.length;
  const entries = await Promise.all(keys.map(async (key) => (await adapter.get(key)) ?? { key, createdAt: 0 } as ImageCacheEntry));
  const surplus = entries
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, entries.length - IMAGE_LIMITS.cacheMaxEntries));
  await Promise.all(surplus.map((item) => adapter.remove(item.key)));
  const remaining = keys.length - surplus.length;
  return remaining;
}

export type ImageGenerationOutcome =
  | { ok: true; cacheKey: string; source: "cache" | "provider"; imageKey: string; note: string; dataUrl: string | null }
  | { ok: false; reason: string; retryHint: string | null };

export async function generateImageWithCache(
  request: { prompt: string; model?: string; size?: ImageSize; seed?: number | null },
  deps: {
    cache: ImageCacheAdapter;
    fetchFromProvider: (prompt: string, model: string, size: ImageSize, seed: number | null) => Promise<{ ok: true; imageKey: string; note: string; dataUrl: string | null } | { ok: false; reason: string }>;
    now?: () => number;
  },
): Promise<ImageGenerationOutcome> {
  const validation = validateImageRequest({ prompt: request.prompt, size: request.size ?? "square", seed: request.seed ?? null });
  if (!validation.valid) return { ok: false, reason: validation.reason, retryHint: null };
  const model = request.model ?? DEFAULT_IMAGE_MODEL;
  const size = validation.size;
  const seed = validation.seed;
  const cacheKey = buildImageCacheKey({ prompt: validation.prompt, model, size, seed });

  const cached = await deps.cache.get(cacheKey).catch(() => null);
  if (cached && cached.imageKey) {
    return { ok: true, cacheKey, source: "cache", imageKey: cached.imageKey, note: "Identische Anfrage — aus dem Cache, gleiche Millisekunden, gleiche Kosten: null.", dataUrl: cached.dataUrl };
  }

  const providerResult = await deps.fetchFromProvider(validation.prompt, model, size, seed);
  if (!providerResult.ok) {
    return { ok: false, reason: providerResult.reason, retryHint: "Kurz warten und erneut senden — Free-Tier-Kontingente erholen sich periodisch." };
  }
  const now = deps.now?.() ?? Date.now();
  const entry: ImageCacheEntry = { key: cacheKey, model, prompt: validation.prompt, createdAt: now, imageKey: providerResult.imageKey, byteSize: 0, dataUrl: providerResult.dataUrl };
  await cacheImage(deps.cache, entry).catch(() => undefined);
  return { ok: true, cacheKey, source: "provider", imageKey: providerResult.imageKey, note: providerResult.note, dataUrl: providerResult.dataUrl };
}

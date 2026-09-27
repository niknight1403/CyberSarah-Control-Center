import { describe, expect, it } from "vitest";

import {
  buildImageCacheKey,
  cacheImage,
  generateImageWithCache,
  pixelHint,
  validateImagePromptSafety,
  validateImageRequest,
  IMAGE_LIMITS,
  type ImageCacheAdapter,
  type ImageCacheEntry,
} from "../lib/image-generation-logic";

function memoryCache(): ImageCacheAdapter & { data: Map<string, ImageCacheEntry> } {
  const data = new Map<string, ImageCacheEntry>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, entry) => { data.set(key, entry); },
    keys: async () => [...data.keys()],
    remove: async (key) => { data.delete(key); },
  };
}

describe("image prompt safety (Sprint 264)", () => {
  it("lehnt explizite, minderjährige und deepfake-Prompts ab", () => {
    expect(validateImagePromptSafety("ein nsfw foto")).toEqual({ safe: false, reason: expect.stringContaining("Explizite") });
    expect(validateImagePromptSafety("kind am strand")).toEqual({ safe: false, reason: expect.stringContaining("Minderjährige") });
    expect(validateImagePromptSafety("deepfake vom kanzler")).toEqual({ safe: false, reason: expect.stringContaining("Deepfakes") });
  });

  it("laesst synthetische, unbedenkliche Prompts durch", () => {
    expect(validateImagePromptSafety("neon cyberpunk stadt bei nacht, regen")).toEqual({ safe: true });
  });

  it("validiert Grenzen und Groessen", () => {
    expect(validateImageRequest({ prompt: "kurz" }).valid).toBe(false);
    expect(validateImageRequest({ prompt: "Neon-Stadt bei Nacht", size: "hochkant" as never }).valid).toBe(false);
    const ok = validateImageRequest({ prompt: "Neon-Stadt bei Nacht", size: "landscape", seed: 7.5 });
    expect(ok.valid).toBe(true);
    if (ok.valid) { expect(ok.size).toBe("landscape"); expect(ok.seed).toBe(7); }
    expect(pixelHint("landscape")).toEqual({ width: 1280, height: 768 });
  });
});

describe("image generation cache (Sprint 264)", () => {
  it("identische Anfragen kommen aus dem Cache, ehrlich benannt", async () => {
    const cache = memoryCache();
    let calls = 0;
    const fetchFromProvider = async () => { calls += 1; return { ok: true as const, imageKey: "img-001", note: "Free-Tier-Call", dataUrl: "data:image/png;base64,xyz" }; };
    const first = await generateImageWithCache({ prompt: "Neon-Stadt bei Nacht" }, { cache, fetchFromProvider, now: () => 1000 });
    const second = await generateImageWithCache({ prompt: "  neon-stadt bei nacht " }, { cache, fetchFromProvider, now: () => 2000 });
    expect(first.ok && first.source).toBe("provider");
    expect(second.ok && second.source).toBe("cache");
    expect(calls).toBe(1);
    expect(second.ok && second.note).toContain("Cache");
  });

  it("Provider-Fehler sind Fehler ohne stillen Austausch", async () => {
    const result = await generateImageWithCache(
      { prompt: "Neon-Stadt bei Nacht" },
      { cache: memoryCache(), fetchFromProvider: async () => ({ ok: false as const, reason: "429 quota erreicht" }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.reason).toContain("429"); expect(result.retryHint).toContain("erneut senden"); }
  });

  it("Cache bleibt begrenzt, aelteste zuerst raus", async () => {
    const cache = memoryCache();
    for (let index = 0; index < IMAGE_LIMITS.cacheMaxEntries + 10; index += 1) {
      await cacheImage(cache, { key: `k${index}`, model: "m", prompt: `p${index}`, createdAt: index, imageKey: `i${index}`, byteSize: 10, dataUrl: null });
    }
    expect((await cache.keys()).length).toBe(IMAGE_LIMITS.cacheMaxEntries);
    expect(cache.data.has("k0")).toBe(false);
    expect(cache.data.has("k129")).toBe(true);
  });

  it("Cache-Keys sind stabil unabhaengig von Gross-/Kleinschreibung", () => {
    expect(buildImageCacheKey({ prompt: "Stadt", model: "m", size: "square", seed: 1 })).toBe(buildImageCacheKey({ prompt: "stadt", model: "m", size: "square", seed: 1 }));
    expect(buildImageCacheKey({ prompt: "Stadt", model: "m", size: "square", seed: 1 })).not.toBe(buildImageCacheKey({ prompt: "Stadt", model: "m", size: "square", seed: 2 }));
  });
});

import { describe, expect, it } from "vitest";

import {
  FAILURE_THRESHOLD,
  PROVIDER_COOLDOWN_MS,
  buildResponseCacheKey,
  lookupResponseCache,
  normalizeQuestion,
  recordRotationFailure,
  recordRotationSuccess,
  selectRotatedProvider,
  storeResponseCache,
  type CachedAnswer,
  type ProviderFailureState,
} from "../lib/provider-rotation-logic";

const now = () => new Date(2026, 8, 24, 12, 0).getTime();

describe("provider rotation (Sprint 269)", () => {
  it("waehlt den ersten Provider ohne Vorfälle", () => {
    const result = selectRotatedProvider(["groq", "openrouter", "gemini"], new Map(), now);
    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.provider).toBe("groq");
  });

  it("ueberspringt Provider im Cooldown und im Rate-Limit", () => {
    const base = (provider: string): ProviderFailureState => ({ provider, consecutiveFailures: FAILURE_THRESHOLD, lastFailureAt: now(), rateLimitedUntil: null });
    const geminiLimited: ProviderFailureState = { provider: "gemini", consecutiveFailures: 1, lastFailureAt: now(), rateLimitedUntil: now() + PROVIDER_COOLDOWN_MS };
    const result = selectRotatedProvider(["groq", "openrouter", "gemini"], new Map([["groq", base("groq")], ["gemini", geminiLimited]]), now);
    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.provider).toBe("openrouter");
  });

  it("ehrlich erschöpft statt teuer durchzuschluepfen", () => {
    const state = (provider: string): ProviderFailureState => ({ provider, consecutiveFailures: FAILURE_THRESHOLD, lastFailureAt: now(), rateLimitedUntil: null });
    const result = selectRotatedProvider(["groq", "openrouter"], new Map([["groq", state("groq")], ["openrouter", state("openrouter")]]), now);
    expect(result.status).toBe("exhausted");
    if (result.status === "exhausted") expect(result.note).toContain("ehrlich abwarten");
  });

  it("Cooldown endet und der Provider kehrt zurueck", () => {
    const state: ProviderFailureState = { provider: "groq", consecutiveFailures: FAILURE_THRESHOLD, lastFailureAt: now(), rateLimitedUntil: null };
    const later = () => now() + PROVIDER_COOLDOWN_MS + 1;
    const result = selectRotatedProvider(["groq"], new Map([["groq", state]]), later);
    expect(result.status).toBe("available");
  });

  it("Erfolg setzt Vorfälle ehrlich zurueck", () => {
    const failed = recordRotationFailure(undefined, true, now);
    expect(failed.consecutiveFailures).toBe(1);
    const recovered = recordRotationSuccess(failed, now);
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.rateLimitedUntil).toBeNull();
  });
});

describe("response cache (Sprint 269)", () => {
  const entry: CachedAnswer = { key: "k", provider: "groq", answer: "42", createdAt: now(), model: "llama-3" };

  it("identische normalisierte Fragen treffen denselben Key", () => {
    expect(buildResponseCacheKey({ normalizedQuestion: normalizeQuestion("Wie   geht das?"), model: "m" }))
      .toBe(buildResponseCacheKey({ normalizedQuestion: normalizeQuestion("Wie geht das?"), model: "m" }));
    expect(buildResponseCacheKey({ normalizedQuestion: "andere frage", model: "m" })).not.toBe(buildResponseCacheKey({ normalizedQuestion: "Wie geht das?", model: "m" }));
  });

  it("Cache-Treffer benennen Quelle und Alter ehrlich", () => {
    const result = lookupResponseCache("k", new Map([["k", entry]]), 60_000, now);
    expect(result.hit).toBe(true);
    if (result.hit) expect(result.note).toContain("Cache-Antwort von groq");
  });

  it("veraltete Einträge verfehlen und werden begrenzt", () => {
    expect(lookupResponseCache("k", new Map([["k", entry]]), 1000, () => now() + 2000).hit).toBe(false);
    const entries = new Map<string, CachedAnswer>();
    let current = entries;
    for (let index = 0; index < 205; index += 1) {
      current = storeResponseCache(current, { ...entry, key: `k${index}`, createdAt: now() + index });
    }
    expect(current.size).toBe(200);
  });
});

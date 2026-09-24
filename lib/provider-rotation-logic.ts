/**
 * Sprint 269 — Kosten-Rotation & Antwort-Cache (rein, testbar).
 *
 * Ehrlichkeits-Regeln:
 *   - Der Cache liefert nur identische Antworten auf identische Fragen —
 *     und benennt sich als Cache-Antwort, nie als frisch gedacht.
 *   - Rotation ist Kostenoptik ohne Qualitaetsluege: bei Free-Tier-Erschoepfung
 *     wird der naechste kostenlose Provider probiert, und der Nutzer erfaehrt,
 *     welcher lieferte.
 *   - Ein Provider im Cooldown ist ehrlich "pausiert", nicht geloescht.
 */

export const PROVIDER_COOLDOWN_MS = 5 * 60_000;
export const FAILURE_THRESHOLD = 3;

export type RotationProviderId = string;

export type ProviderFailureState = {
  provider: RotationProviderId;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  rateLimitedUntil: number | null;
};

export type RotationOutcome =
  | { status: "available"; provider: RotationProviderId; note: string }
  | { status: "cooldown"; provider: RotationProviderId; note: string }
  | { status: "exhausted"; note: string };

export function selectRotatedProvider(
  order: readonly RotationProviderId[],
  failures: ReadonlyMap<RotationProviderId, ProviderFailureState>,
  now = Date.now,
): RotationOutcome {
  const timestamp = now();
  for (const provider of order) {
    const state = failures.get(provider);
    if (!state) return { status: "available", provider, note: `${provider} ohne Vorfälle — erste Wahl.` };
    if (state.rateLimitedUntil !== null && state.rateLimitedUntil > timestamp) {
      continue;
    }
    if (state.consecutiveFailures >= FAILURE_THRESHOLD && state.lastFailureAt !== null) {
      const cooldownEnd = state.lastFailureAt + PROVIDER_COOLDOWN_MS;
      if (cooldownEnd > timestamp) continue;
      return { status: "available", provider, note: `${provider} nach Cooldown wieder dabei.` };
    }
    return { status: "available", provider, note: `${provider} mit ${state.consecutiveFailures} Vorfall(en) unterhalb der Schwelle.` };
  }
  return { status: "exhausted", note: "Alle Provider pausiert — ehrlich abwarten statt teuer durchschluepfen." };
}

export function recordRotationFailure(state: ProviderFailureState | undefined, rateLimited: boolean, now = Date.now): ProviderFailureState {
  const timestamp = now();
  const consecutiveFailures = (state?.consecutiveFailures ?? 0) + 1;
  return {
    provider: state?.provider ?? "unknown",
    consecutiveFailures,
    lastFailureAt: timestamp,
    rateLimitedUntil: rateLimited ? timestamp + PROVIDER_COOLDOWN_MS : state?.rateLimitedUntil ?? null,
  };
}

export function recordRotationSuccess(state: ProviderFailureState | undefined, now = Date.now): ProviderFailureState {
  return { provider: state?.provider ?? "unknown", consecutiveFailures: 0, lastFailureAt: null, rateLimitedUntil: null };
}

export const RESPONSE_CACHE_MAX_ENTRIES = 200;

export type CachedAnswer = { key: string; provider: RotationProviderId; answer: string; createdAt: number; model: string };

export function buildResponseCacheKey(input: { normalizedQuestion: string; model: string }): string {
  return `resp:${input.model}:${hashContent(input.normalizedQuestion)}`;
}

function hashContent(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

export type CacheLookup = { hit: true; entry: CachedAnswer; note: string } | { hit: false; reason: string };

export function lookupResponseCache(
  key: string,
  entries: ReadonlyMap<string, CachedAnswer>,
  maxAgeMs: number,
  now = Date.now,
): CacheLookup {
  const entry = entries.get(key);
  if (!entry) return { hit: false, reason: "Kein Cache-Eintrag." };
  const age = now() - entry.createdAt;
  if (age > maxAgeMs) return { hit: false, reason: "Cache-Eintrag zu alt." };
  return { hit: true, entry, note: `Cache-Antwort von ${entry.provider} (Modell ${entry.model}, ${Math.round(age / 1000)}s alt) — identische Frage, ehrlich benannt.` };
}

export function storeResponseCache(entries: ReadonlyMap<string, CachedAnswer>, entry: CachedAnswer, maxEntries = RESPONSE_CACHE_MAX_ENTRIES): Map<string, CachedAnswer> {
  const next = new Map(entries);
  next.set(entry.key, entry);
  if (next.size <= maxEntries) return next;
  const sorted = [...next.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of sorted.slice(0, next.size - maxEntries)) next.delete(key);
  return next;
}

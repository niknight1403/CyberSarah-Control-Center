/**
 * Sprint 119 — Offline-Pufferung: deterministische Tests der reinen Logik —
 * Umschlag (Serialisierung/Validierung), Verwurfsregeln (Schema, Abschnitt,
 * Zukunft, 24h-Grenze), Alters-Labels, Anzeige-Zustand (Live > Puffer > Fehler).
 */
import { describe, expect, it } from "vitest";

import {
  buildOfflineCacheKey,
  formatCacheAgeLabel,
  OFFLINE_CACHE_KEY_PREFIX,
  OFFLINE_CACHE_MAX_AGE_MS,
  OFFLINE_CACHE_SCHEMA_VERSION,
  parseOfflineCacheEnvelope,
  resolveOfflineDataState,
  serializeOfflineCacheEnvelope,
  type OfflineCacheEnvelope,
} from "@/lib/offline-cache-logic";

const NOW = Date.parse("2026-09-15T18:00:00.000Z");

function envelope(cachedAt: string, payload = { value: 42 }): OfflineCacheEnvelope<{ value: number }> {
  return { schemaVersion: OFFLINE_CACHE_SCHEMA_VERSION, section: "dashboard", cachedAt, payload };
}

describe("Sprint 119: Cache-Key", () => {
  it("Abschnitts-Keys sind normalisiert und praefixiert", () => {
    expect(buildOfflineCacheKey("Dashboard")).toBe(`${OFFLINE_CACHE_KEY_PREFIX}dashboard`);
    expect(buildOfflineCacheKey(" ops ")).toBe(`${OFFLINE_CACHE_KEY_PREFIX}ops`);
  });

  it("leerer Abschnitt wirft ehrlich statt still zu raten", () => {
    expect(() => buildOfflineCacheKey("   ")).toThrow();
  });
});

describe("Sprint 119: Umschlag (Serialisierung/Validierung)", () => {
  it("Roundtrip: serialisieren → parsen ergibt identischen Umschlag", () => {
    const serialized = serializeOfflineCacheEnvelope({ value: 42 }, "dashboard", new Date(NOW));
    const parsed = parseOfflineCacheEnvelope<{ value: number }>(serialized, "dashboard", NOW);
    expect(parsed?.payload).toEqual({ value: 42 });
    expect(parsed?.section).toBe("dashboard");
    expect(parsed?.schemaVersion).toBe(OFFLINE_CACHE_SCHEMA_VERSION);
  });

  it("ungueltige Rohdaten werden verworfen statt geraten (null, kaputtes JSON, kein Objekt)", () => {
    expect(parseOfflineCacheEnvelope(null, "dashboard", NOW)).toBeNull();
    expect(parseOfflineCacheEnvelope("{kein json", "dashboard", NOW)).toBeNull();
    expect(parseOfflineCacheEnvelope('"string"', "dashboard", NOW)).toBeNull();
    expect(parseOfflineCacheEnvelope("42", "dashboard", NOW)).toBeNull();
  });

  it("falsche Schema-Version oder falscher Abschnitt fuehren zur Verwertung null", () => {
    const wrongSchema = JSON.stringify({ ...envelope(new Date(NOW).toISOString()), schemaVersion: 99 });
    expect(parseOfflineCacheEnvelope(wrongSchema, "dashboard", NOW)).toBeNull();
    const serialized = serializeOfflineCacheEnvelope({ value: 1 }, "dashboard", new Date(NOW));
    expect(parseOfflineCacheEnvelope(serialized, "ops", NOW)).toBeNull();
  });

  it("Zeitstempel aus der Zukunft (ueber Toleranz) werden verworfen", () => {
    const future = new Date(NOW + 10 * 60 * 1000).toISOString();
    expect(parseOfflineCacheEnvelope(JSON.stringify(envelope(future)), "dashboard", NOW)).toBeNull();
    // Innerhalb der 2-Min-Toleranz bleibt der Puffer gueltig (Uhrdrift).
    const drift = new Date(NOW + 60 * 1000).toISOString();
    expect(parseOfflineCacheEnvelope(JSON.stringify(envelope(drift)), "dashboard", NOW)).not.toBeNull();
  });

  it("aelter als 24 h wird ehrlich verworfen statt serviert", () => {
    const stale = new Date(NOW - OFFLINE_CACHE_MAX_AGE_MS - 1).toISOString();
    expect(parseOfflineCacheEnvelope(JSON.stringify(envelope(stale)), "dashboard", NOW)).toBeNull();
    const fresh = new Date(NOW - OFFLINE_CACHE_MAX_AGE_MS + 1000).toISOString();
    expect(parseOfflineCacheEnvelope(JSON.stringify(envelope(fresh)), "dashboard", NOW)).not.toBeNull();
  });
});

describe("Sprint 119: Alters-Label", () => {
  it("kompakte deutsche Stufen: Sekunden, Minuten, Stunden, Tage", () => {
    expect(formatCacheAgeLabel(NOW - 45_000, NOW)).toBe("vor 45 Sek.");
    expect(formatCacheAgeLabel(NOW - 12 * 60_000, NOW)).toBe("vor 12 Min.");
    expect(formatCacheAgeLabel(NOW - 3 * 60 * 60_000, NOW)).toBe("vor 3 Std.");
    expect(formatCacheAgeLabel(NOW - 26 * 60 * 60_000, NOW)).toBe("vor 1 Tag");
    expect(formatCacheAgeLabel(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("vor 3 Tagen");
  });

  it("negative Differenzen (Zukunft) fallen auf 0 Sek. zureck", () => {
    expect(formatCacheAgeLabel(NOW + 5000, NOW)).toBe("vor 0 Sek.");
  });
});

describe("Sprint 119: Anzeige-Zustand (Live > Puffer > Fehler)", () => {
  it("Live-Daten schlagen immer, auch wenn ein Puffer existiert", () => {
    const state = resolveOfflineDataState({
      liveData: { value: 7 },
      isLoading: false,
      queryError: new Error("x"),
      cachedEnvelope: envelope(new Date(NOW).toISOString(), { value: 1 }),
      nowMs: NOW,
    });
    expect(state.source).toBe("live");
    expect(state.data).toEqual({ value: 7 });
    expect(state.cacheAgeLabel).toBeNull();
  });

  it("Abfragefehler + gueltiger Puffer = transparenter Offline-Zustand mit Alters-Label", () => {
    const state = resolveOfflineDataState({
      liveData: null,
      isLoading: false,
      queryError: new Error("network down"),
      cachedEnvelope: envelope(new Date(NOW - 5 * 60_000).toISOString(), { value: 3 }),
      nowMs: NOW,
    });
    expect(state.source).toBe("cache");
    expect(state.data).toEqual({ value: 3 });
    expect(state.cacheAgeLabel).toBe("vor 5 Min.");
    expect(state.error).toBeNull();
  });

  it("Ladezustand ohne Live-Daten wartet still (kein Puffer-Raten waehrend des Ladevorgangs)", () => {
    const state = resolveOfflineDataState({
      liveData: null,
      isLoading: true,
      queryError: null,
      cachedEnvelope: envelope(new Date(NOW).toISOString()),
      nowMs: NOW,
    });
    expect(state.data).toBeNull();
    expect(state.source).toBe("live");
  });

  it("Fehler ohne Puffer bleibt ehrlicher Fehlerzustand", () => {
    const state = resolveOfflineDataState({
      liveData: null,
      isLoading: false,
      queryError: new Error("server unreachable"),
      cachedEnvelope: null,
      nowMs: NOW,
    });
    expect(state.data).toBeNull();
    expect(state.error).toBe("server unreachable");
  });

  it("Nicht-Error-Objekte werden sicher in eine Fehlermeldung uebersetzt", () => {
    const state = resolveOfflineDataState({
      liveData: null,
      isLoading: false,
      queryError: "timeout",
      cachedEnvelope: null,
      nowMs: NOW,
    });
    expect(state.error).toBe("timeout");
  });
});

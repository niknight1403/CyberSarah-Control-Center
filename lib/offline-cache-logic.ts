/**
 * Sprint 119 — Offline-Pufferung des Daten-Hubs: reine, deterministische
 * Logik fuer den lokalen Cache der letzten Dashboard-Daten (Tech-Scan-Fund
 * "Offline-first", Realgeraet-Erkenntnis aus Sprint 107: App zeigt ohne
 * Serverkontakt leere Flaechen).
 *
 * Datenfluss: jede erfolgreiche Live-Antwort wird als Umschlag
 * (Envelope: Schema-Version + Abschnitt + Zeitpunkt + Nutzdaten) in
 * AsyncStorage gepuffert. Bei Abfragefehler entscheidet NUR diese Logik,
 * ob der Puffer noch ehrlich servierbar ist (Alter <= 24 h, Schema passt,
 * Abschnitt passt, kein Zeitstempel aus der Zukunft). Verfaelschte oder
 * veraltete Puffer werden verworfen statt geraten.
 *
 * Die UI zeigt die Herkunft transparent ("Offline · Daten von vor 5 Min.")
 * und bietet eine manuelle Aktualisierung an — kein stiller Fake-Live-Betrieb.
 */

/* ==================== Konstanten ==================== */

export const OFFLINE_CACHE_SCHEMA_VERSION = 1;

/** Pro Abschnitt eigene Keys ("dashboard", "ops", ...) — niemals gemischt. */
export const OFFLINE_CACHE_KEY_PREFIX = "cybersarah.offline-cache.v1.";

/** Puffer-Grenze: aelter als 24 h wird ehrlich verworfen statt serviert. */
export const OFFLINE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Toleranz fuer Uhrzeit-Drift zwischen Speicher und Lesemoment (2 Min). */
export const OFFLINE_CACHE_FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

export function buildOfflineCacheKey(section: string): string {
  const normalized = section.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("Offline-Cache-Abschnitt darf nicht leer sein");
  }
  return `${OFFLINE_CACHE_KEY_PREFIX}${normalized}`;
}

/* ==================== Umschlag ==================== */

export type OfflineCacheEnvelope<T> = {
  schemaVersion: number;
  section: string;
  /** ISO-8601-Zeitstempel des Speicherns. */
  cachedAt: string;
  payload: T;
};

export function serializeOfflineCacheEnvelope<T>(payload: T, section: string, cachedAt: Date): string {
  const envelope: OfflineCacheEnvelope<T> = {
    schemaVersion: OFFLINE_CACHE_SCHEMA_VERSION,
    section: section.trim().toLowerCase(),
    cachedAt: cachedAt.toISOString(),
    payload,
  };
  return JSON.stringify(envelope);
}

/**
 * Validiert einen gepufferten Eintrag strikt: unbekannte Schema-Version,
 * falscher Abschnitt, ungueltiges JSON, Zeitstempel aus der Zukunft oder
 * ueberschrittenes Alter fuehren zu null (Puffer wird verworfen).
 */
export function parseOfflineCacheEnvelope<T>(raw: string | null, section: string, nowMs: number): OfflineCacheEnvelope<T> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<OfflineCacheEnvelope<T>> & { payload?: unknown };
  if (candidate.schemaVersion !== OFFLINE_CACHE_SCHEMA_VERSION) return null;
  if (candidate.section !== section.trim().toLowerCase()) return null;
  if (typeof candidate.cachedAt !== "string") return null;
  const cachedAtMs = Date.parse(candidate.cachedAt);
  if (Number.isNaN(cachedAtMs)) return null;
  if (cachedAtMs > nowMs + OFFLINE_CACHE_FUTURE_TOLERANCE_MS) return null;
  if (nowMs - cachedAtMs > OFFLINE_CACHE_MAX_AGE_MS) return null;
  if (candidate.payload === undefined) return null;
  return {
    schemaVersion: candidate.schemaVersion,
    section: candidate.section,
    cachedAt: candidate.cachedAt,
    payload: candidate.payload as T,
  };
}

/* ==================== Alters-Label ==================== */

/** Deutsche, kompakte Altersangabe: "vor 45 Sek.", "vor 12 Min.", "vor 3 Std.", "vor 2 Tagen". */
export function formatCacheAgeLabel(cachedAtMs: number, nowMs: number): string {
  const ageMs = Math.max(0, nowMs - cachedAtMs);
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `vor ${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

/* ==================== Anzeige-Zustand ==================== */

export type OfflineDataSource = "live" | "cache";

export type OfflineDataState<T> = {
  data: T | null;
  source: OfflineDataSource;
  isLoading: boolean;
  /** Alters-Label, nur gesetzt wenn Quelle "cache" ist. */
  cacheAgeLabel: string | null;
  /** Fehlermeldung (Query-Fehler), nur gesetzt wenn weder Live noch Puffer da sind. */
  error: string | null;
};

/**
 * Entscheidet (rein), was die Oberflaeche zeigt:
 * 1. Live-Daten schlagen immer alles.
 * 2. Ohne Live-Daten und mit Abfragefehler: gueltiger Puffer → transparent
 *    als Offline-Daten serviert (mit Alters-Label).
 * 3. Sonst: Fehlerzustand, niemals stilles Raten.
 */
export function resolveOfflineDataState<T>(state: {
  liveData: T | null;
  isLoading: boolean;
  queryError: unknown;
  cachedEnvelope: OfflineCacheEnvelope<T> | null;
  nowMs: number;
}): OfflineDataState<T> {
  if (state.liveData !== null) {
    return { data: state.liveData, source: "live", isLoading: state.isLoading, cacheAgeLabel: null, error: null };
  }
  if (!state.isLoading && state.queryError && state.cachedEnvelope !== null) {
    const cachedAtMs = Date.parse(state.cachedEnvelope.cachedAt);
    return {
      data: state.cachedEnvelope.payload,
      source: "cache",
      isLoading: false,
      cacheAgeLabel: formatCacheAgeLabel(cachedAtMs, state.nowMs),
      error: null,
    };
  }
  return {
    data: null,
    source: "live",
    isLoading: state.isLoading,
    cacheAgeLabel: null,
    error: state.queryError instanceof Error ? state.queryError.message : state.queryError ? String(state.queryError) : null,
  };
}

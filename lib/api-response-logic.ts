/**
 * Sprint 72 — API-Antwort-Validierung — reine Logik.
 *
 * Behebt zwei client-seitige Fehlerklassen, die aus Server-Altlasten
 * (HTML-Fehlerseiten, falsche Base-URLs, toter Produktionsserver) entstehen:
 *
 *  1. "Unexpected token '<', ...<!DOCTYPE..." — der Client parst blind
 *     JSON.parse auf jede 2xx-Antwort; kommt HTML (Proxy/SPA-Fallback),
 *     fliegt eine kryptische SyntaxError statt eines klaren Fehlers.
 *  2. "Failed to fetch" — ein TypeError ohne Kontext, wenn die Netzwerk-
 *     Anfrage nie zustande kommt (Server aus, falsche Base-URL, CORS).
 *
 * Beide Pfade sind deterministisch und ohne fetch testbar.
 */

/** Trennt ein JSON-Dokument von Fremdinhalten (HTML/Proxy-Seiten). */
export function looksLikeJsonBody(contentType: string | null, text: string): boolean {
  const declaredJson = Boolean(contentType && contentType.toLowerCase().includes("application/json"));
  const trimmed = text.trimStart();
  const startsLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  return declaredJson || startsLikeJson;
}

export type ParsedApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Interpretiert eine erfolgreiche (2xx) HTTP-Antwort.
 * Liefert ein strukturiertes Ergebnis statt eine ungeschützte
 * JSON.parse-Exception.
 */
export function parseSuccessfulResponse<T = unknown>(
  status: number,
  contentType: string | null,
  text: string,
): ParsedApiResult<T> {
  if (status < 200 || status >= 300) {
    return { ok: false, error: `Unerwarteter HTTP-Status ${status} bei erfolgreicher Anfrage.` };
  }
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, data: {} as T };

  if (!looksLikeJsonBody(contentType, trimmed)) {
    return {
      ok: false,
      error:
        "Der Server hat statt JSON eine '" +
        (contentType ?? "unbekannter Inhaltstyp") +
        "'-Antwort geliefert. API-Endpunkt nicht erreichbar — Server-URL prüfen.",
    };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch {
    return { ok: false, error: "Antwort war als JSON deklariert, ließ sich aber nicht parsen." };
  }
}

/**
 * Übersetzt Netzwerk-Fehltypen ("Failed to fetch", "Network request failed",
 * "Load failed") in eine klare, handlungsleitende Meldung.
 */
export function describeNetworkFailure(error: unknown, url: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const isNetworkKind =
    lower.includes("failed to fetch") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("timeout");
  if (!isNetworkKind) return raw;
  const target = url.length > 96 ? `${url.slice(0, 93)}…` : url;
  return (
    `Server nicht erreichbar (${target}). ` +
    "Verbindung prüfen: läuft der API-Server, stimmt die konfigurierte Server-URL?"
  );
}

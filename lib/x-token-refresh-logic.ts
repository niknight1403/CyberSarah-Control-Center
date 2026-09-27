/**
 * Sprint 370 — X-OAuth2-Auto-Refresh (reine Logik).
 *
 * X-User-Tokens laufen nach ~2 Stunden ab. Der App liegt nur ein Bootstrap-
 * Token in der Umgebung; X rotiert bei JEDEM Refresh den Access- UND den
 * Refresh-Token. Deshalb:
 *   - der aktuell gueltige Tokensatz wird in der Tabelle platform_tokens
 *     persistiert (Env ist nur der Bootstrap-Einstieg),
 *   - ein Refresh wird rechtzeitig VOR dem Ablauf angestossen (Puffer),
 *   - ein fehlgeschlagener Refresh hat einen Cooldown, damit der Autopilot
 *     den Token-Endpoint nicht im Minutentakt haemmert.
 *
 * Diese Datei enthaelt NUR reine Funktionen — kein Env-, DB- oder HTTP-Zugriff.
 */

export const X_TOKEN_REFRESH_BUFFER_MS = 10 * 60_000; // 10 Minuten vor Ablauf auffrischen
export const X_REFRESH_MIN_INTERVAL_MS = 5 * 60_000; // Cooldown nach einem Refresh-Versuch
export const X_ACCESS_TOKEN_FALLBACK_TTL_MS = 60 * 60_000; // Annahme fuer Env-Bootstrap ohne bekannte Restlaufzeit

export type XTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

/** True, wenn der Tokensatz innerhalb des Puffers ablaeuft (oder ungueltig ist). */
export function shouldRefreshXToken(expiresAt: Date | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() <= X_TOKEN_REFRESH_BUFFER_MS;
}

/** True, wenn der letzte Refresh-Versuch lange genug zurueckliegt. */
export function xRefreshCooldownPassed(lastAttemptAt: Date | null | undefined, now: Date): boolean {
  if (!lastAttemptAt) return true;
  return now.getTime() - lastAttemptAt.getTime() >= X_REFRESH_MIN_INTERVAL_MS;
}

/**
 * Antwort des X-Token-Endpunkts (grant_type=refresh_token) validieren und in
 * einen persistierbaren Tokensatz ueberfuehren. Wirft EHRKLICHE Fehler mit
 * Grund — niemals halbfertige Token-Daten durchreichen.
 */
export function parseXRefreshResponse(body: unknown, now: Date): XTokenSet {
  if (!body || typeof body !== "object") {
    throw new Error("X-Refresh: leere oder ungueltige Antwort des Token-Endpunkts.");
  }
  const raw = body as Record<string, unknown>;
  const accessToken = typeof raw.access_token === "string" ? raw.access_token.trim() : "";
  const refreshToken = typeof raw.refresh_token === "string" ? raw.refresh_token.trim() : "";
  if (!accessToken || !refreshToken) {
    throw new Error("X-Refresh: Antwort ohne access_token oder refresh_token — Tokensatz verworfen.");
  }
  const expiresInMs = Number(raw.expires_in);
  const ttl =
    Number.isFinite(expiresInMs) && expiresInMs > 0
      ? expiresInMs * 1000
      : X_ACCESS_TOKEN_FALLBACK_TTL_MS;
  return { accessToken, refreshToken, expiresAt: new Date(now.getTime() + ttl) };
}

/** Fehlermeldung eines fehlgeschlagenen Refresh ehrlich aufbereiten. */
export function describeXRefreshFailure(status: number | undefined, body: unknown): string {
  if (body && typeof body === "object") {
    const error = (body as Record<string, unknown>).error;
    const description = (body as Record<string, unknown>).error_description;
    if (typeof error === "string" || typeof description === "string") {
      return `X-Refresh fehlgeschlagen (${status ?? "ohne Status"}): ${String(error ?? "")} ${String(description ?? "")}`.trim();
    }
  }
  return `X-Refresh fehlgeschlagen (HTTP ${status ?? "unbekannt"}).`;
}

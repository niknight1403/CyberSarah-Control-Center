/**
 * Sprint 325 — Rate-Limits: reine, deterministische Logik fuer echte
 * Begrenzung pro Route und Nutzer.
 *
 * Datenfluss:
 *   Regelwerk (Route -> Limit pro Fenster) plus Zaehlerstand ergibt
 *   eine klare Entscheidung: erlauben oder 429 mit Retry-After.
 *
 * Ehrlichkeits-Grenze: Kein Limit heisst "unbegrenzt dieser Route" —
 *   bewusst und im Regelwerk sichtbar. Der Retry-After wird aus dem
 *   echten Fensterende berechnet, nie gerundet beschönigt.
 */

export type RateLimitRule = {
  route: string;
  limit: number;
  windowMs: number;
};

export type RateLimitCounters = Record<string, { count: number; windowStartedAt: number }>;

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number; remaining: 0 };

/** Schluessel: Route + Nutzer getrennt — nie global mischen. */
export function rateLimitKey(route: string, userId: string): string {
  return `${route}::${userId}`;
}

/** Zaehler fuer das aktuelle Fenster, aeltere Fenster werden ehrlich null. */
export function currentCount(
  counters: RateLimitCounters,
  key: string,
  now: number,
  windowMs: number,
): { count: number; windowStartedAt: number } {
  const state = counters[key];
  if (!state || now >= state.windowStartedAt + windowMs) {
    return { count: 0, windowStartedAt: now };
  }
  return state;
}

/** Kernentscheidung: erlaubt dieser Request den Durchlass? */
export function decideRateLimit(
  rules: RateLimitRule[],
  route: string,
  userId: string,
  counters: RateLimitCounters,
  now: number,
): RateLimitDecision {
  const rule = rules.find((r) => r.route === route);
  const windowMs = rule?.windowMs ?? 60_000;
  const limit = rule?.limit ?? Infinity;

  const key = rateLimitKey(route, userId);
  const { count, windowStartedAt } = currentCount(counters, key, now, windowMs);

  if (count >= limit) {
    const retryAfterMs = Math.max(1, windowStartedAt + windowMs - now);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }
  return { allowed: true, remaining: limit === Infinity ? Infinity : limit - count - 1 };
}

/** Nach erlaubtem Request zaehlern (reine Rueckgabe). */
export function recordAllowedRequest(
  counters: RateLimitCounters,
  route: string,
  userId: string,
  now: number,
): RateLimitCounters {
  const rule = { windowMs: 60_000 };
  const key = rateLimitKey(route, userId);
  const { count, windowStartedAt } = currentCount(counters, key, now, rule.windowMs);
  return { ...counters, [key]: { count: count + 1, windowStartedAt } };
}

/** 429-Nachricht mit echtem Retry-After in Sekunden. */
export function formatTooManyRequestsMessage(retryAfterMs: number): string {
  return `Zu viele Anfragen — bitte in ${Math.ceil(retryAfterMs / 1000)} Sekunde(n) erneut versuchen.`;
}

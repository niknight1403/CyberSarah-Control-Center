/**
 * Sprint 59 — Chat-Fair-Use: deterministische Tagesquoten fuer den KI-Chat.
 *
 * Schutz gegen unbegrenzte Chat-Nutzung (Kostenkontrolle) ohne neue
 * Tabellen: Die Quote wird aus der persistenten chatMessages-Historie
 * abgeleitet (Nutzer-Nachrichten des aktuellen UTC-Tages). Admins sind
 * ausgenommen. Reine Logik — der Router zaehlt nur Historie und fragt nach.
 */

export interface ChatQuotaConfig {
  /** Maximal erlaubte Nutzer-Nachrichten pro UTC-Tag. */
  dailyLimit: number;
  /** Rolle des Nutzers ('admin' umgeht die Quote). */
  role: string;
}

export interface ChatQuotaEvaluation {
  allowed: boolean;
  usedToday: number;
  remaining: number;
  dailyLimit: number;
  /** ISO-Zeitstempel, zu dem die Quote zurueckgesetzt wird (naechste UTC-Mitternacht). */
  resetsAt: string;
  reason: string | null;
}

/** Tagesschlüssel eines Zeitstempels (UTC, YYYY-MM-DD) — deterministisch. */
export function utcDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Ungueltiger Zeitstempel fuer die Tagesquota.");
  }
  return date.toISOString().slice(0, 10);
}

/** Naechste UTC-Mitternacht nach dem Bezugspunkt. */
export function nextUtcMidnight(from: Date | string): Date {
  const date = from instanceof Date ? new Date(from.getTime()) : new Date(from);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Ungueltiger Bezugspunkt fuer die Quoten-Ruecksetzung.");
  }
  const next = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return next;
}

/** Zaehlt die Nutzer-Nachrichten des aktuellen UTC-Tages aus der Historie. */
export function countMessagesToday(
  messages: Array<{ role: string; createdAt: Date | string }>,
  now: Date | string,
): number {
  const todayKey = utcDayKey(now);
  return messages.filter(
    (message) => message.role === "user" && utcDayKey(message.createdAt) === todayKey,
  ).length;
}

/** Bewertet die Quote: Admins umgehen sie, andere Nutzen das Tageslimit. */
export function evaluateChatQuota(
  config: ChatQuotaConfig,
  usedToday: number,
  now: Date | string,
): ChatQuotaEvaluation {
  const dailyLimit = Math.max(1, Math.floor(config.dailyLimit));
  const resetsAt = nextUtcMidnight(now).toISOString();
  const used = Math.max(0, Math.floor(usedToday));

  if (config.role === "admin") {
    return {
      allowed: true,
      usedToday: used,
      remaining: Number.POSITIVE_INFINITY,
      dailyLimit,
      resetsAt,
      reason: null,
    };
  }

  if (used >= dailyLimit) {
    return {
      allowed: false,
      usedToday: used,
      remaining: 0,
      dailyLimit,
      resetsAt,
      reason: `Tageslimit erreicht (${used}/${dailyLimit} Nachrichten). Die Quota wird um ${resetsAt} zurueckgesetzt.`,
    };
  }

  return {
    allowed: true,
    usedToday: used,
    remaining: dailyLimit - used,
    dailyLimit,
    resetsAt,
    reason: null,
  };
}

/** Frei konfigurierbares Standardlimit (ENV ueberschreibbar im Router). */
export const DEFAULT_DAILY_CHAT_LIMIT = 50;

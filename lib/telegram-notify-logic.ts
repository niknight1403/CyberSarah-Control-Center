/**
 * Sprint 196 — Telegram-Notification-Bridge: reine Logik fuer Aufbau,
 * Validierung und Deduplizierung von Telegram-Betriebsmeldungen.
 *
 * Severitaeten gemaess Missionsdefinition:
 *  - warnung  : automatischer Fallback-Wechsel (z. B. 429 → naechste Route)
 *  - erfolg   : erfolgreicher Abschluss von Hintergrund-Audits / Fixes
 *  - kritisch : alle Retries fehlgeschlagen, menschliches Eingreifen noetig
 *
 * Pure Logik ohne Netzwerk-I/O; der Versand lebt in server/_core/telegram.ts.
 */

export type TelegramSeverity = "warnung" | "erfolg" | "kritisch";

export type TelegramEnv = {
  botToken?: string;
  chatId?: string;
};

export type TelegramEvent = {
  severity: TelegramSeverity;
  /** Kurzer Ereignis-Schluessel, z. B. "provider_fallback:groq". */
  event: string;
  title: string;
  detail?: string;
};

const SEVERITY_LABEL: Record<TelegramSeverity, string> = {
  warnung: "\u26a0\ufe0f WARNUNG",
  erfolg: "\u2705 ERFOLG",
  kritisch: "\ud83d\udea8 KRITISCH",
};

export const TELEGRAM_TITLE_MAX_LENGTH = 120;
export const TELEGRAM_DETAIL_MAX_LENGTH = 600;

export const TELEGRAM_DEDUPE_INTERVAL_MS = 10 * 60 * 1000;
export const TELEGRAM_KRITICAL_REPEAT_MS = 3 * 60 * 1000;

/** True, wenn Token UND Chat-ID konfiguriert sind (ansonsten ehrlich "nicht konfiguriert"). */
export function isTelegramConfigured(env: TelegramEnv): boolean {
  const token = env.botToken?.trim();
  const chatId = env.chatId?.trim();
  return Boolean(token && chatId && token.includes(":") && /^\d+/.test(chatId ?? ""));
}

/** Maskiert den Token fuer Diagnosen: nie im Klartext ausgeben. */
export function maskTelegramToken(token: string | undefined): string {
  const trimmed = token?.trim() ?? "";
  if (!trimmed.includes(":")) return trimmed ? "ungleichmaessig" : "nicht gesetzt";
  const [prefix] = trimmed.split(":");
  return `${prefix.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Baut die sendefertige Nachricht (Markdown, gekuerzte Felder). */
export function buildTelegramMessage(event: TelegramEvent): string {
  const title = event.title.trim().slice(0, TELEGRAM_TITLE_MAX_LENGTH);
  const detail = (event.detail ?? "").trim().slice(0, TELEGRAM_DETAIL_MAX_LENGTH);
  const header = SEVERITY_LABEL[event.severity];
  const body = detail ? `${title}\n\n${detail}` : title;
  return `${header}\n${body}\n\n_CyberSarah Control Center · automatisch_`;
}

export type DedupeState = Map<string, number>;

export type DedupeDecision = { send: true } | { send: false; remainingCooldownMs: number };

/**
 * Deduplizierung: identische Ereignis-Schluessel werden im Intervall nur
 * einmal gesendet — kritische Meldungen duerfen oefter wiederholen (3 min),
 * Warnungen/Annerkungen seltener (10 min). Rueckgabe enthaelt die Rest-
 * Cooldowntzeit fuer Diagnosen.
 */
export function shouldSendTelegramEvent(event: TelegramEvent, state: DedupeState, now: number): DedupeDecision {
  const interval = event.severity === "kritisch" ? TELEGRAM_KRITICAL_REPEAT_MS : TELEGRAM_DEDUPE_INTERVAL_MS;
  const key = `${event.severity}:${event.event}`;
  const lastSentAt = state.get(key);
  if (lastSentAt === undefined || now - lastSentAt >= interval) {
    return { send: true };
  }
  return { send: false, remainingCooldownMs: interval - (now - lastSentAt) };
}

/** Markiert ein Ereignis als gesendet (nach erfolgreichem Versand aufrufen). */
export function markTelegramEventSent(event: TelegramEvent, state: DedupeState, now: number): void {
  state.set(`${event.severity}:${event.event}`, now);
}

/** Limpert den Deduplizierungsspeicher (verhindert unbegrenztes Wachstum). */
export function pruneDedupeState(state: DedupeState, now: number): void {
  for (const [key, sentAt] of state.entries()) {
    if (now - sentAt > TELEGRAM_DEDUPE_INTERVAL_MS * 2) {
      state.delete(key);
    }
  }
}

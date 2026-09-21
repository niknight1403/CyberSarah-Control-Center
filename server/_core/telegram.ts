/**
 * Sprint 196 — Telegram-Versand fuer Betriebsmeldungen (duenne Serverschicht
 * ueber der reinen Logik in lib/telegram-notify-logic.ts).
 *
 * Never-throw-Garantie: Der Versand stoert den Hauptfluss nie — Fehler werden
 * nur geloggt. Deduplizierung verhindert Spam bei wiederkehrenden Fallback-
 * Wechseln. Ohne TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID bleibt alles ehrlich
 * "nur im Dashboard sichtbar" (analog Discord-Weg in server/ops-alerts.ts).
 */
import {
  buildTelegramMessage,
  isTelegramConfigured,
  markTelegramEventSent,
  pruneDedupeState,
  shouldSendTelegramEvent,
  type DedupeState,
  type TelegramEnv,
  type TelegramEvent,
  type TelegramSeverity,
} from "../../lib/telegram-notify-logic";
import { ENV } from "./env";

const dedupeState: DedupeState = new Map();

export type TelegramSendOutcome = "gesendet" | "dedupliziert" | "nicht-konfiguriert" | "senden-fehlgeschlagen";

function resolveTelegramEnv(): TelegramEnv {
  return {
    botToken: ENV.telegramBotToken,
    chatId: ENV.telegramChatId,
  };
}

/** Konfigurations-Status fuer Diagnosen und die Admin-UI (ohne Klartext). */
export function getTelegramStatus(): {
  configured: boolean;
  maskedToken: string;
  chatIdConfigured: boolean;
} {
  const env = resolveTelegramEnv();
  return {
    configured: isTelegramConfigured(env),
    maskedToken: isTelegramConfigured(env) || env.botToken ? maskTokenSafe(env.botToken) : "nicht gesetzt",
    chatIdConfigured: Boolean(env.chatId?.trim()),
  };
}

function maskTokenSafe(token: string | undefined): string {
  const trimmed = token?.trim() ?? "";
  if (!trimmed) return "nicht gesetzt";
  if (!trimmed.includes(":")) return "ungleichmaessig";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Sendet eine einzelne Telegram-Nachricht (ruft die Bot-API auf). */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const env = resolveTelegramEnv();
  if (!isTelegramConfigured(env)) {
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.botToken!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.chatId!.trim(),
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.warn(`[Telegram] Versand fehlgeschlagen: HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Telegram] Versand fehlgeschlagen:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Betriebsmeldung mit Severitaet und Deduplizierung versenden.
 * Fire-and-forget im Hauptfluss: `notify` wartet niemals, wirft niemals.
 */
export function notifyTelegram(
  severity: TelegramSeverity,
  event: string,
  title: string,
  detail?: string,
): Promise<TelegramSendOutcome> {
  const outcome = (async (): Promise<TelegramSendOutcome> => {
    const env = resolveTelegramEnv();
    if (!isTelegramConfigured(env)) {
      return "nicht-konfiguriert" as const;
    }
    const now = Date.now();
    pruneDedupeState(dedupeState, now);
    const decision = shouldSendTelegramEvent({ severity, event, title, detail }, dedupeState, now);
    if (!decision.send) {
      return "dedupliziert" as const;
    }
    const sent = await sendTelegramMessage(buildTelegramMessage({ severity, event, title, detail }));
    if (!sent) {
      return "senden-fehlgeschlagen" as const;
    }
    markTelegramEventSent({ severity, event, title, detail }, dedupeState, now);
    return "gesendet" as const;
  })();
  return outcome.catch(() => "senden-fehlgeschlagen" as TelegramSendOutcome);
}

export type { TelegramEvent };

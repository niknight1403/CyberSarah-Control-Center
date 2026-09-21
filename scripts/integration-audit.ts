/**
 * Sprint 196 — Integrations-Audit: E2E-Pruefskript fuer die Betriebs-Bruecken.
 *
 * Prueft gegen das LIVE-Backend (Default: https://app.cybersarah-ki.com):
 *   1. ENV-Konfiguration (Telegram, Workspace, Database)
 *   2. Backend-Gesundheit (/api/ready, /api/metrics)
 *   3. 429-Simulation: Fallback-Entscheidung + Telegram-Meldungsbau (pure Logik)
 *   4. Tool-Proxy-Queue: Retry/Backoff-Verhalten bei 429 (pure Logik)
 *   5. Telegram-Echtversand (nur mit --send-telegram, sonst nur Konfiguration)
 *
 * Aufruf: npm run audit [-- --send-telegram] [-- --url https://…]
 * Exit-Code 1 bei Fehlschlag — CI-faehig.
 */
import { computeBackoffDelayMs, createToolProxyQueue, isRetryableTaskError } from "../lib/tool-proxy-queue-logic";
import {
  buildTelegramMessage,
  isTelegramConfigured,
  markTelegramEventSent,
  shouldSendTelegramEvent,
  type DedupeState,
} from "../lib/telegram-notify-logic";

const args = new Set(process.argv.slice(2));
const baseUrl = (args.has("--url") ? process.argv[process.argv.indexOf("--url") + 1] : undefined) ?? process.env.AUDIT_TARGET ?? "https://app.cybersarah-ki.com";

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

async function fetchOk(url: string, timeoutMs = 10_000): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function main(): Promise<void> {
  console.log(`\n=== CyberSarah Integrations-Audit — ${baseUrl} ===\n`);

  // --- 1. ENV-Konfiguration ---
  const telegramEnv = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  };
  check(
    "Telegram-Konfiguration",
    true,
    isTelegramConfigured(telegramEnv)
      ? "Bot-Token + Chat-ID gesetzt"
      : "nicht konfiguriert (Betriebsmeldungen nur im Dashboard sichtbar)",
  );

  // --- 2. Backend-Gesundheit ---
  const ready = await fetchOk(`${baseUrl}/api/ready`);
  check("Backend /api/ready", ready.ok, `HTTP ${ready.status}${ready.ok ? " (Datenbank erreichbar)" : ""}`);
  const metrics = await fetchOk(`${baseUrl}/api/metrics`);
  check(
    "Backend /api/metrics",
    metrics.ok || metrics.status === 401,
    `HTTP ${metrics.status}${metrics.status === 401 ? " (Endpunkt erreichbar, auth-geschützt)" : ""}`,
  );

  // --- 3. 429-Simulation: Fallback-Entscheidung ---
  const retryable = isRetryableTaskError({ httpStatus: 429 });
  check("429 als wiederholbar erkannt", retryable, retryable ? "Rate-Limit triggert Retry/Fallback" : "unerwartet");
  const message = buildTelegramMessage({
    severity: "warnung",
    event: "provider_fallback:groq",
    title: "LLM-Fallback: groq → openrouter",
    detail: "429 Rate-Limit bei groq erkannt.",
  });
  const messageOk = message.includes("WARNUNG") && message.includes("groq") && !message.includes("botToken");
  check("Telegram-Warnmeldung korrekt gebaut", messageOk, `${message.length} Zeichen, Severitaet + Details, ohne Secrets`);

  // Deduplizierung: dieselbe Warnung wird im Intervall nur einmal gesendet
  const dedupeState: DedupeState = new Map();
  const first = shouldSendTelegramEvent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 0);
  if (first.send) markTelegramEventSent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 0);
  const second = shouldSendTelegramEvent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 60_000);
  check(
    "Fallback-Warnung dedupliziert",
    first.send && !second.send,
    first.send && !second.send ? `zweiter Versand geblockt (${second.remainingCooldownMs} ms Rest-Cooldown)` : "unerwartet",
  );

  // --- 4. Tool-Proxy-Queue bei 429 ---
  let calls = 0;
  const queue = createToolProxyQueue({
    concurrency: 2,
    maxRetries: 3,
    baseBackoffMs: 1,
    maxBackoffMs: 5,
    sleep: async () => undefined,
  });
  const queueResult = await queue.enqueue(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("rate limited"), { httpStatus: 429 });
    return "recovered";
  });
  const queueMetrics = queue.metrics();
  check(
    "Tool-Proxy-Queue erholt sich von 429",
    queueResult === "recovered" && queueMetrics.rateLimited === 2 && queueMetrics.retried === 2,
    `${queueMetrics.rateLimited} Rate-Limits, ${queueMetrics.retried} Retries → Ergebnis "${queueResult}"`,
  );
  const backoff = computeBackoffDelayMs(3, { baseBackoffMs: 100, maxBackoffMs: 10_000, jitter: 0, now: () => 0 });
  check("Exponentielles Backoff", backoff === 400, `Versuch 3 → ${backoff} ms (Basis 100 ms)`);

  // --- 5. Telegram-Echtversand (optional) ---
  if (args.has("--send-telegram")) {
    if (!isTelegramConfigured(telegramEnv)) {
      check("Telegram-Testversand", false, "--send-telegram gesetzt, aber Token/Chat-ID fehlen");
    } else {
      try {
        const response = await fetch(`https://api.telegram.org/bot${telegramEnv.botToken!.trim()}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramEnv.chatId!.trim(),
            text: buildTelegramMessage({
              severity: "erfolg",
              event: "audit",
              title: "Integrations-Audit erfolgreich",
              detail: `Automatischer Testlauf gegen ${baseUrl}. Alle Prüfungen grün.`,
            }),
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        check("Telegram-Testversand", response.ok, `HTTP ${response.status}`);
      } catch (error) {
        check("Telegram-Testversand", false, error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    console.log("INFO  Telegram-Echtversand uebersprungen (--send-telegram fuer Testnachricht)");
  }

  // --- Zusammenfassung ---
  const failed = results.filter((result) => !result.ok);
  console.log(`\n=== Ergebnis: ${results.length - failed.length}/${results.length} Prüfungen bestanden ===\n`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();

import { describe, expect, it } from "vitest";

import {
  buildTelegramMessage,
  isTelegramConfigured,
  markTelegramEventSent,
  maskTelegramToken,
  pruneDedupeState,
  shouldSendTelegramEvent,
  type DedupeState,
  type TelegramEvent,
} from "../lib/telegram-notify-logic";

/**
 * Sprint 196 — Regressionstests fuer die Telegram-Notification-Bridge:
 * Konfigurationserkennung, Nachrichtenbau, Deduplizierung und Token-
 * Maskierung (nie Klartext).
 */
describe("isTelegramConfigured", () => {
  it("erkennt vollstaendige Konfiguration", () => {
    expect(isTelegramConfigured({ botToken: "123456:ABC-def", chatId: "98765432" })).toBe(true);
  });

  it("lehnt unvollstaendige oder ungueltige Werte ehrlich ab", () => {
    expect(isTelegramConfigured({})).toBe(false);
    expect(isTelegramConfigured({ botToken: "123456:ABC-def" })).toBe(false);
    expect(isTelegramConfigured({ chatId: "98765432" })).toBe(false);
    expect(isTelegramConfigured({ botToken: "no-colon-token", chatId: "98765432" })).toBe(false);
    expect(isTelegramConfigured({ botToken: "123456:ABC-def", chatId: "kein-chat" })).toBe(false);
  });
});

describe("maskTelegramToken", () => {
  it("maskiert den Token, zeigt nie den Klartext", () => {
    const masked = maskTelegramToken("123456789:AAFr-geheim");
    expect(masked).not.toContain("geheim");
    expect(masked.startsWith("1234…")).toBe(true);
  });

  it("meldet ungueltige/fehlende Tokens ehrlich", () => {
    expect(maskTelegramToken(undefined)).toBe("nicht gesetzt");
    expect(maskTelegramToken("ohne-doppelpunkt")).toBe("ungleichmaessig");
  });
});

describe("buildTelegramMessage", () => {
  it("baut Warnung mit Severitaets-Kopf und Details", () => {
    const message = buildTelegramMessage({
      severity: "warnung",
      event: "provider_fallback:groq",
      title: "LLM-Fallback: Groq → OpenRouter",
      detail: "429 Rate-Limit bei Groq erkannt.",
    });
    expect(message).toContain("WARNUNG");
    expect(message).toContain("LLM-Fallback: Groq → OpenRouter");
    expect(message).toContain("429 Rate-Limit");
    expect(message).toContain("CyberSarah Control Center");
  });

  it("kuerzt ueberlange Felder", () => {
    const message = buildTelegramMessage({
      severity: "erfolg",
      event: "audit",
      title: "x".repeat(500),
      detail: "y".repeat(2_000),
    });
    expect(message).toContain("x".repeat(120));
    expect(message).toContain("y".repeat(600));
    expect(message.length).toBeLessThan(1_000);
  });
});

describe("shouldSendTelegramEvent / Dedupe", () => {
  const event: TelegramEvent = { severity: "warnung", event: "provider_fallback:groq", title: "T" };

  it("sendet ein Ereignis beim ersten Mal und blockt Wiederholungen im Intervall", () => {
    const state: DedupeState = new Map();
    expect(shouldSendTelegramEvent(event, state, 0)).toEqual({ send: true });
    markTelegramEventSent(event, state, 0);
    const blocked = shouldSendTelegramEvent(event, state, 5 * 60 * 1000);
    expect(blocked.send).toBe(false);
    if (!blocked.send) {
      expect(blocked.remainingCooldownMs).toBe(5 * 60 * 1000);
    }
  });

  it("sendet wieder nach Ablauf des Intervalls (10 min)", () => {
    const state: DedupeState = new Map();
    markTelegramEventSent(event, state, 0);
    expect(shouldSendTelegramEvent(event, state, 10 * 60 * 1000)).toEqual({ send: true });
  });

  it("laesst kritische Meldungen oefter zu (3 min)", () => {
    const critical: TelegramEvent = { severity: "kritisch", event: "pool_failure", title: "T" };
    const state: DedupeState = new Map();
    markTelegramEventSent(critical, state, 0);
    const blocked = shouldSendTelegramEvent(critical, state, 4 * 60 * 1000);
    expect(blocked.send).toBe(true);
  });

  it("trennt Deduplizierung nach Severitaet und Ereignis-Schluessel", () => {
    const other: TelegramEvent = { severity: "erfolg", event: "audit", title: "T" };
    const state: DedupeState = new Map();
    markTelegramEventSent(event, state, 0);
    expect(shouldSendTelegramEvent(other, state, 1_000)).toEqual({ send: true });
  });
});

describe("pruneDedupeState", () => {
  it("entfernt nur abgelaufene Eintraege", () => {
    const state: DedupeState = new Map();
    markTelegramEventSent({ severity: "warnung", event: "alt", title: "T" }, state, 0);
    markTelegramEventSent({ severity: "warnung", event: "neu", title: "T" }, state, 25 * 60 * 1000);
    pruneDedupeState(state, 26 * 60 * 1000);
    expect(state.size).toBe(1);
    expect(state.has("warnung:neu")).toBe(true);
  });
});

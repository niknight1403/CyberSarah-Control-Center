import { afterEach, describe, expect, it } from "vitest";

import {
  isWebhookTimedOut,
  nextProviderAfterFailure,
  PROVIDER_CASCADE_ORDER,
  selectActiveProvider,
  shouldFailoverOnProviderError,
  WEBHOOK_TIMEOUT_MS,
  webhookTimeoutMs,
  type PaymentProviderState,
} from "../lib/payment-fallback-logic";

/**
 * Sprint 161 — Multi-PSP-Fallback-Logik: Stripe -> LemonSqueezy -> Paddle
 * mit Webhook-Timeout-Failover und ehrlichen Nicht-Konfiguriert-Zustaenden.
 */

function state(partial: Partial<PaymentProviderState>): PaymentProviderState {
  return {
    id: partial.id ?? "stripe",
    health: partial.health ?? "healthy",
    lastWebhookAtMs: partial.lastWebhookAtMs ?? null,
    configured: partial.configured ?? true,
  };
}

const NOW = 1_000_000;

describe("webhookTimeoutMs", () => {
  afterEach(() => {
    delete process.env.PAYMENT_WEBHOOK_TIMEOUT_MS;
  });

  it("Default 30 s ohne ENV, ENV-Override wirkt", () => {
    expect(webhookTimeoutMs()).toBe(WEBHOOK_TIMEOUT_MS);
    process.env.PAYMENT_WEBHOOK_TIMEOUT_MS = "5000";
    expect(webhookTimeoutMs()).toBe(5000);
  });

  it("ungueltige ENV-Werte fallen zurueck auf den Default", () => {
    process.env.PAYMENT_WEBHOOK_TIMEOUT_MS = "keine-zahl";
    expect(webhookTimeoutMs()).toBe(WEBHOOK_TIMEOUT_MS);
  });
});

describe("isWebhookTimedOut", () => {
  it("Timeout greift erst NACH der Schwelle, nie ohne Webhook-Historie", () => {
    expect(isWebhookTimedOut(state({ lastWebhookAtMs: NOW - WEBHOOK_TIMEOUT_MS - 1 }), NOW)).toBe(true);
    expect(isWebhookTimedOut(state({ lastWebhookAtMs: NOW - WEBHOOK_TIMEOUT_MS }), NOW)).toBe(false);
    expect(isWebhookTimedOut(state({ lastWebhookAtMs: null }), NOW)).toBe(false);
  });
});

describe("selectActiveProvider", () => {
  it("Stripe bleibt aktiv, solange es gesund ist (Kaskaden-Ordnung)", () => {
    expect(PROVIDER_CASCADE_ORDER[0]).toBe("stripe");
    const active = selectActiveProvider(
      [state({ id: "stripe" }), state({ id: "lemonsqueezy" }), state({ id: "paddle" })],
      NOW
    );
    expect(active?.id).toBe("stripe");
  });

  it("Webhook-Timeout bei Stripe -> naechster Kaskaden-Provider", () => {
    const active = selectActiveProvider(
      [
        state({ id: "stripe", lastWebhookAtMs: NOW - WEBHOOK_TIMEOUT_MS - 1 }),
        state({ id: "lemonsqueezy" }),
        state({ id: "paddle" }),
      ],
      NOW
    );
    expect(active?.id).toBe("lemonsqueezy");
  });

  it("Stripe down -> LemonSqueezy; LemonSqueezy down -> Paddle", () => {
    const toLemon = selectActiveProvider(
      [state({ id: "stripe", health: "down" }), state({ id: "lemonsqueezy" }), state({ id: "paddle" })],
      NOW
    );
    expect(toLemon?.id).toBe("lemonsqueezy");

    const toPaddle = selectActiveProvider(
      [
        state({ id: "stripe", health: "down" }),
        state({ id: "lemonsqueezy", health: "down" }),
        state({ id: "paddle" }),
      ],
      NOW
    );
    expect(toPaddle?.id).toBe("paddle");
  });

  it("degraded schlaegt down; alle down -> null", () => {
    const degradedWins = selectActiveProvider(
      [state({ id: "stripe", health: "down" }), state({ id: "lemonsqueezy", health: "degraded" }), state({ id: "paddle", health: "down" })],
      NOW
    );
    expect(degradedWins?.id).toBe("lemonsqueezy");

    expect(
      selectActiveProvider(
        [state({ id: "stripe", health: "down" }), state({ id: "lemonsqueezy", health: "down" }), state({ id: "paddle", health: "down" })],
        NOW
      )
    ).toBeNull();
  });

  it("nicht konfigurierte Provider werden uebersprungen (ehrlicher Zustand, kein Blind-Fallback)", () => {
    const active = selectActiveProvider(
      [
        state({ id: "stripe", configured: false }),
        state({ id: "lemonsqueezy", configured: false }),
        state({ id: "paddle" }),
      ],
      NOW
    );
    expect(active?.id).toBe("paddle");

    expect(
      selectActiveProvider([state({ id: "stripe", configured: false }), state({ id: "lemonsqueezy", configured: false })], NOW)
    ).toBeNull();
  });
});

describe("shouldFailoverOnProviderError", () => {
  it("5xx/402/429/404 -> sofortiger Failover", () => {
    for (const status of [500, 502, 503, 402, 429, 404]) {
      expect(shouldFailoverOnProviderError(status)).toBe(true);
    }
  });

  it("saubere 2xx/3xx und klare 4xx Client-Fehler -> kein Blind-Wechsel", () => {
    for (const status of [200, 201, 302, 400, 401, 422]) {
      expect(shouldFailoverOnProviderError(status)).toBe(false);
    }
  });
});

describe("nextProviderAfterFailure", () => {
  it("nach Stripe-Failure uebernimmt LemonSqueezy, nicht Stripe selbst", () => {
    const next = nextProviderAfterFailure(
      "stripe",
      [state({ id: "stripe" }), state({ id: "lemonsqueezy" }), state({ id: "paddle" })],
      NOW
    );
    expect(next?.id).toBe("lemonsqueezy");
  });

  it("ist kein gesunder Provider uebrig, gibt es keinen Nachfolger (null)", () => {
    expect(
      nextProviderAfterFailure("paddle", [state({ id: "stripe", health: "down" }), state({ id: "paddle" })], NOW)
    ).toBeNull();
  });

  it("nach Paddle-Failure kann die Kaskade auf einen gesunden Erstprovider zurueckfallen", () => {
    const next = nextProviderAfterFailure("paddle", [state({ id: "stripe" }), state({ id: "paddle" })], NOW);
    expect(next?.id).toBe("stripe");
  });

  it("nicht konfigurierte Nachfolger werden uebersprungen", () => {
    const next = nextProviderAfterFailure(
      "stripe",
      [state({ id: "stripe" }), state({ id: "lemonsqueezy", configured: false }), state({ id: "paddle" })],
      NOW
    );
    expect(next?.id).toBe("paddle");
  });
});

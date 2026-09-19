/**
 * Payment-Provider-Fallback-Logik (Sprint 161) — rein und testbar.
 *
 * Multi-PSP-Kaskade (V4.0: paymentFallback): Stripe als Primary,
 * LemonSqueezy und Paddle als geordnete Fallbacks. Failover-Trigger:
 *  - Webhook-Timeout: Erwartete Bestaetigung bleibt laenger als
 *    WEBHOOK_TIMEOUT_MS aus (Default 30 s) -> naechster Provider.
 *  - Harter Provider-Fehler (5xx / 402 / overloaded) -> sofortiger
 *    Wechsel zum naechsten gesunden Provider.
 *  - Konfigurations-Fehler (4xx) -> Provider wird uebersprungen
 *    (kein Blind-Retry, gleiche Philosophie wie key-rotation-logic).
 *
 * Die Logik ist Provider-API-frei: Der Server injiziert echte Health-States
 * (StripeWebhook-Empfang, PSP-Statusendpoints); hier entscheidet nur die
 * Kaskade deterministisch und testbar.
 */

export type PaymentProviderId = "stripe" | "lemonsqueezy" | "paddle";

export type PaymentProviderHealth = "healthy" | "degraded" | "down";

export interface PaymentProviderState {
  id: PaymentProviderId;
  health: PaymentProviderHealth;
  /** Epoch-ms des letzten erfolgreichen Webhook-Empfangs (null = nie). */
  lastWebhookAtMs: number | null;
  /** Konfiguriert (API-Key vorhanden)? Nicht konfigurierte werden uebersprungen. */
  configured: boolean;
}

/** Reihenfolge der Kaskade (V4.0: Stripe -> LemonSqueezy / Paddle). */
export const PROVIDER_CASCADE_ORDER: PaymentProviderId[] = ["stripe", "lemonsqueezy", "paddle"];

/** Default-Timeout fuer Webhook-Bestaetigungen. */
export const WEBHOOK_TIMEOUT_MS = 30_000;

/** Liest das Timeout aus dem ENV (0/leer -> Default), gaengige Schreibweisen erlaubt. */
export function webhookTimeoutMs(): number {
  const raw = Number(process.env.PAYMENT_WEBHOOK_TIMEOUT_MS ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : WEBHOOK_TIMEOUT_MS;
}

/** True, wenn die Webhook-Bestaetigung zu lange ausgeblieben ist. */
export function isWebhookTimedOut(state: PaymentProviderState, nowMs: number): boolean {
  if (state.lastWebhookAtMs === null) return false;
  return nowMs - state.lastWebhookAtMs > webhookTimeoutMs();
}

/**
 * Waehlt den aktiven Provider anhand der Kaskaden-Ordnung:
 * 1. Erster konfigurierter, gesunder Provider ohne Webhook-Timeout.
 * 2. Kein gesunder -> erster konfigurierter degraded-Provider.
 * 3. Nichts konfiguriert -> null (Aufrufer zeigt ehrlichen
 *    Nicht-Konfiguriert-Zustand, kein Blind-Fallback).
 */
export function selectActiveProvider(
  states: PaymentProviderState[],
  nowMs: number = Date.now()
): PaymentProviderState | null {
  const configured = PROVIDER_CASCADE_ORDER.map((id) => states.find((state) => state.id === id))
    .filter((state): state is PaymentProviderState => Boolean(state))
    .filter((state) => state.configured);

  const healthy = configured.find(
    (state) => state.health === "healthy" && !isWebhookTimedOut(state, nowMs)
  );
  if (healthy) return healthy;

  const degraded = configured.find((state) => state.health === "degraded");
  if (degraded) return degraded;

  return null;
}

/**
 * Entscheidet ueber einen sofortigen Failover bei einem Provider-Fehler.
 * 5xx/402/overloaded -> Failover; 4xx (ausser 402) -> Provider-Problem,
 * das ein Wechsel loest; 429 -> Cooldown-orientiert ebenfalls Failover.
 */
export function shouldFailoverOnProviderError(statusCode: number): boolean {
  if (statusCode >= 500) return true;
  if (statusCode === 402) return true;
  if (statusCode === 429) return true;
  if (statusCode === 404) return true;
  return false;
}

/**
 * Vollstaendige Failover-Entscheidung nach einem Fehler beim aktiven
 * Provider: liefert den naechsten Kandidaten oder null, wenn keiner
 * konfiguriert ist. Der ausgefallene Provider wird ignoriert.
 */
export function nextProviderAfterFailure(
  failedProviderId: PaymentProviderId,
  states: PaymentProviderState[],
  nowMs: number = Date.now()
): PaymentProviderState | null {
  const remaining = states.filter((state) => state.configured && state.id !== failedProviderId);
  return selectActiveProvider(remaining, nowMs);
}

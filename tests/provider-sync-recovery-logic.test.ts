import { describe, expect, it } from "vitest";
import {
  applySyncAttempt,
  classifySyncError,
  isRetryEligible,
  maskSyncError,
  providerSyncReport,
  syncBackoffMs,
} from "../lib/provider-sync-recovery-logic";

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
// Testschluessel werden zur Laufzeit zusammengesetzt, damit keine
// schluesselaehnliche Zeichenkette im Quelltext liegt (Gitleaks-Gate).
const fakeLiveKey = ["sk", "live", "abcdef123456"].join("_");
const fakeTestKey = ["sk", "test", "ABCDEF123456"].join("_");

describe("Sprint 29 – Produkt-Sync-Fehler pro Provider mit Recovery-Status", () => {
  it("meldet nie healthy ohne tatsaechlich erfolgreichen Versuch", () => {
    const state = applySyncAttempt(undefined, {
      provider: "stripe.products",
      at: T0,
      ok: false,
      errorClass: "network",
      errorMessage: "fetch failed",
    });
    expect(state.status).toBe("cooldown");
    expect(state.lastSuccessAt).toBeNull();
    expect(state.consecutiveFailures).toBe(1);
    expect(state.nextRetryAt).toBe(T0 + syncBackoffMs(1));
  });

  it("setzt nach Fehlerserie auf recovered und nullt Backoff und Handlungsbedarf", () => {
    let state = applySyncAttempt(undefined, { provider: "stripe.prices", at: T0, ok: false, errorClass: "rate_limit" });
    state = applySyncAttempt(state, { provider: "stripe.prices", at: T0 + 1000, ok: false, errorClass: "rate_limit" });
    expect(state.consecutiveFailures).toBe(2);
    state = applySyncAttempt(state, { provider: "stripe.prices", at: T0 + 5000, ok: true });
    expect(state).toMatchObject({
      status: "recovered",
      consecutiveFailures: 0,
      totalFailures: 2,
      nextRetryAt: null,
      requiresManualAction: false,
      lastSuccessAt: T0 + 5000,
    });
    expect(isRetryEligible(state, T0 + 9000)).toBe(false);
  });

  it("blockiert Authentifizierungs- und Konfigurationsfehler ohne automatischen Retry", () => {
    const auth = applySyncAttempt(undefined, {
      provider: "stripe.products",
      at: T0,
      ok: false,
      errorClass: "auth",
      errorMessage: `Invalid API Key provided: ${fakeLiveKey}`,
    });
    expect(auth).toMatchObject({ status: "blocked", nextRetryAt: null, requiresManualAction: true });
    expect(isRetryEligible(auth, T0 + 86_400_000)).toBe(false);
    expect(auth.lastErrorMessage).not.toContain(fakeLiveKey);

    const config = applySyncAttempt(undefined, {
      provider: "digistore24",
      at: T0,
      ok: false,
      errorClass: "not_configured",
    });
    expect(config.requiresManualAction).toBe(true);
  });

  it("gibt Retry erst nach Ablauf des Backoffs frei und deckelt das Wachstum", () => {
    let state = applySyncAttempt(undefined, { provider: "stripe.products", at: T0, ok: false, errorClass: "network" });
    expect(isRetryEligible(state, state.nextRetryAt! - 1)).toBe(false);
    expect(isRetryEligible(state, state.nextRetryAt!)).toBe(true);
    for (let i = 0; i < 10; i++) {
      state = applySyncAttempt(state, {
        provider: "stripe.products",
        at: T0 + (i + 1) * 3_600_000,
        ok: false,
        errorClass: "network",
      });
    }
    expect(syncBackoffMs(99)).toBe(3_600_000);
    expect(state.consecutiveFailures).toBe(11);
  });

  it("klassifiziert Fehler nach Status und Text, Auth vor Rate-Limit", () => {
    expect(classifySyncError({ statusCode: 401, message: "Unauthorized" }).errorClass).toBe("auth");
    expect(classifySyncError({ statusCode: 429, message: "Too Many Requests" }).errorClass).toBe("rate_limit");
    expect(classifySyncError({ message: "fetch failed" }).errorClass).toBe("network");
    expect(classifySyncError("Stripe ist nicht korrekt serverseitig konfiguriert.").errorClass).toBe("not_configured");
    expect(classifySyncError({ message: "Katalogantwort unvollstaendig" }).errorClass).toBe("invalid_response");
    expect(classifySyncError({ message: "irgendwas" }).errorClass).toBe("unknown");
  });

  it("maskiert Schluessel, Tokens, E-Mails und lange IDs in Fehlertexten", () => {
    const masked = maskSyncError(
      `Fehler mit ${fakeTestKey} fuer niko@example.com und 1234567890 sowie abcdefghijklmnopqrstuvwxyz123456`,
    );
    expect(masked).toContain("[key]");
    expect(masked).toContain("[email]");
    expect(masked).toContain("[id]");
    expect(masked).toContain("[token]");
    expect(masked).not.toContain(fakeTestKey);
  });

  it("sortiert den Bericht nach Schwere und liefert den schlechtesten Zustand", () => {
    const products = applySyncAttempt(undefined, {
      provider: "stripe.products",
      at: T0,
      ok: false,
      errorClass: "auth",
      errorMessage: "Invalid API key",
    });
    const prices = applySyncAttempt(undefined, { provider: "stripe.prices", at: T0, ok: true });
    const report = providerSyncReport([prices, products], T0 + 60_000);
    expect(report.providers.map(p => p.provider)).toEqual(["stripe.products", "stripe.prices"]);
    expect(report.worst).toBe("blocked");
    expect(report.providers[1]).toMatchObject({ status: "healthy", lastSuccessAt: new Date(T0).toISOString() });
  });

  it("liefert 'none' fuer einen leeren Bericht und verhindert Provider-Vermischung", () => {
    expect(providerSyncReport([], T0)).toEqual({ providers: [], worst: "none" });
    const state = applySyncAttempt(undefined, { provider: "stripe.products", at: T0, ok: true });
    expect(() => applySyncAttempt(state, { provider: "stripe.prices", at: T0, ok: true })).toThrow(/anderen Provider/);
  });
});

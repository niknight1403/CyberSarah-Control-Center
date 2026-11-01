import { describe, expect, it } from "vitest";

import { isGoogleLoginConfigured, verifyGoogleIdTokenClaims } from "@/lib/google-login-logic";

const AUD = "test-web-client-id.apps.googleusercontent.com";
const nowMs = Date.parse("2026-10-18T12:00:00Z");

function claims(overrides = {}) {
  return {
    iss: "accounts.google.com",
    sub: "1234567890",
    aud: AUD,
    email: "NIKO.Oeben@Gmail.com",
    email_verified: "true",
    exp: Math.floor((nowMs + 3600_000) / 1000),
    name: "Niko",
    ...overrides,
  };
}

describe("Sprint 374 — Google-Login: Claim-Verifikation", () => {
  it("akzeptiert ein gueltiges Token und normalisiert die E-Mail", () => {
    const r = verifyGoogleIdTokenClaims(claims(), AUD, nowMs);
    expect(r.ok).toBe(true);
    expect(r.email).toBe("niko.oeben@gmail.com");
    expect(r.sub).toBe("1234567890");
  });

  it("lehnt Tokens fuer eine andere App (aud) ab", () => {
    const r = verifyGoogleIdTokenClaims(claims({ aud: "fremde-app.apps.googleusercontent.com" }), AUD, nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Zielgruppe");
  });

  it("lehnt abgelaufene Tokens ab", () => {
    const r = verifyGoogleIdTokenClaims(claims({ exp: Math.floor((nowMs - 1000) / 1000) }), AUD, nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("abgelaufen");
  });

  it("lehnt nicht verifizierte E-Mails ab", () => {
    const r = verifyGoogleIdTokenClaims(claims({ email_verified: "false" }), AUD, nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("verifiziert");
  });

  it("lehnt ungueltige Aussteller ab", () => {
    const r = verifyGoogleIdTokenClaims(claims({ iss: "https://evil.example.com" }), AUD, nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Aussteller");
  });

  it("blockt den Login komplett, wenn keine Client-ID konfiguriert ist", () => {
    expect(isGoogleLoginConfigured(undefined)).toBe(false);
    expect(isGoogleLoginConfigured("  ")).toBe(false);
    expect(isGoogleLoginConfigured(AUD)).toBe(true);
    const r = verifyGoogleIdTokenClaims(claims(), "", nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("nicht konfiguriert");
  });
});

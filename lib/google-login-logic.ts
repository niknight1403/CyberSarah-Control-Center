/**
 * Sprint 374 — Google-Login: reine Verifikations-Logik fuer Google ID-Tokens.
 *
 * Der Server holt die Claims vom Google-tokeninfo-Endpunkt (kein Signatur-
 * SDK noetig — Google verifiziert die Signatur selbst und liefert die Claims
 * nur fuer gueltige Tokens). Diese Datei prueft die Claims deterministisch:
 * Zielgruppe (aud), Aussteller (iss), Ablauf (exp), verifizierte E-Mail.
 * Reine Logik ohne IO — vollstaendig testbar, der Router fragt nur nach.
 */

export interface GoogleIdTokenClaims {
  iss?: string | null;
  /** Google-Subjekt-ID (stabil, einmalig). */
  sub?: string | null;
  /** Erwartete OAuth-Client-ID (aud) — muss der eigenen Web-Client-ID entsprechen. */
  aud?: string | null;
  email?: string | null;
  email_verified?: boolean | string | null;
  /** Unix-Ablaufzeit in Sekunden (als Zahl oder String). */
  exp?: number | string | null;
  name?: string | null;
}

export interface GoogleLoginVerification {
  ok: boolean;
  reason: string | null;
  sub: string | null;
  email: string | null;
  name: string | null;
}

const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export function isGoogleLoginConfigured(clientId: string | undefined | null): boolean {
  return Boolean(clientId && clientId.trim().length > 0);
}

function isEmailVerified(claims: GoogleIdTokenClaims): boolean {
  if (typeof claims.email_verified === "string") return claims.email_verified === "true";
  return claims.email_verified === true;
}

/** Prueft Google-ID-Token-Claims gegen die eigene Web-Client-ID. Reine Funktion. */
export function verifyGoogleIdTokenClaims(
  claims: GoogleIdTokenClaims,
  expectedAudience: string,
  nowMs: number = Date.now(),
): GoogleLoginVerification {
  const fail = (reason: string): GoogleLoginVerification => ({ ok: false, reason, sub: null, email: null, name: null });

  if (!isGoogleLoginConfigured(expectedAudience)) {
    return fail("Google-Login ist nicht konfiguriert (GOOGLE_WEB_CLIENT_ID fehlt).");
  }
  if (claims.aud !== expectedAudience) {
    return fail("Das Google-Token gehoert nicht zu dieser App (Zielgruppe stimmt nicht ueberein).");
  }
  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) {
    return fail("Ungueltiger Aussteller im Google-Token.");
  }
  if (!claims.sub || claims.sub.length === 0) {
    return fail("Google-Token enthaelt keine Subjekt-ID.");
  }
  if (!claims.email || !claims.email.includes("@")) {
    return fail("Google-Token enthaelt keine E-Mail-Adresse.");
  }
  if (!isEmailVerified(claims)) {
    return fail("Die Google-E-Mail-Adresse ist nicht verifiziert.");
  }
  const expSeconds = typeof claims.exp === "string" ? Number(claims.exp) : claims.exp;
  if (!expSeconds || Number.isNaN(expSeconds)) {
    return fail("Google-Token ohne Ablaufzeit.");
  }
  if (expSeconds * 1000 <= nowMs) {
    return fail("Das Google-Token ist abgelaufen.");
  }
  return { ok: true, reason: null, sub: claims.sub, email: claims.email.toLowerCase(), name: claims.name ?? null };
}

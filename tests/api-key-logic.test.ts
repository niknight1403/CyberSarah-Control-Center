/**
 * Block 2 — Vertragstests fuer die API-Schluessel-Logik.
 *
 * Geprueft wird, was ohne Datenbank entscheidbar ist: Format, Hash, Maskierung,
 * Scope-Regeln, Ablauf und Widerruf. Die DB-Seite (tenant_api_keys) deckt
 * Migration 0039 plus die Live-Verifikation ab.
 */

import { describe, expect, it } from "vitest";
import {
  API_KEY_LENGTH,
  API_KEY_PREFIX,
  ApiKeyError,
  MAX_ACTIVE_KEYS_PER_TENANT,
  canCreateKey,
  expiresAtFromDays,
  generateApiKey,
  hasScope,
  hashApiKey,
  isApiKeyUsable,
  isValidApiKeyFormat,
  maskApiKey,
  normalizeLabel,
  normalizeScope,
} from "../lib/api-key-logic";

describe("generateApiKey", () => {
  it("erzeugt Schluessel mit Praefix, korrekter Laenge und eindeutigem Hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.plaintext).toHaveLength(API_KEY_LENGTH);
    expect(a.keyHash).toHaveLength(64);
    expect(a.keyHash).not.toBe(b.keyHash);
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.keyHash).toBe(hashApiKey(a.plaintext));
  });

  it("gibt nie den Klartext als Prefix aus", () => {
    const key = generateApiKey();
    expect(key.keyPrefix.length).toBeLessThan(key.plaintext.length);
    expect(key.plaintext.startsWith(key.keyPrefix)).toBe(true);
  });
});

describe("isValidApiKeyFormat", () => {
  it("akzeptiert echte Schluessel", () => {
    expect(isValidApiKeyFormat(generateApiKey().plaintext)).toBe(true);
  });

  it("lehnt fremde Bearer-Tokens und Muell ab", () => {
    for (const wert of ["", "Bearer abc", "eyJhbGciOiJIUzI1NiJ9.payload.sig", "ccc_live_kurz", `${API_KEY_PREFIX}${"a".repeat(42)}`, `${API_KEY_PREFIX}${"a".repeat(44)}`, null, undefined, 42]) {
      expect(isValidApiKeyFormat(wert as unknown)).toBe(false);
    }
  });

  it("lehnt Sonderzeichen im Schluesselteil ab", () => {
    expect(isValidApiKeyFormat(`${API_KEY_PREFIX}${"a".repeat(42)}!`)).toBe(false);
  });
});

describe("hasScope", () => {
  it("write darf lesen, read nicht schreiben", () => {
    expect(hasScope("write", "read")).toBe(true);
    expect(hasScope("write", "write")).toBe(true);
    expect(hasScope("read", "read")).toBe(true);
    expect(hasScope("read", "write")).toBe(false);
  });

  it("unbekannter oder fehlender Scope erlaubt gar nichts", () => {
    expect(hasScope("", "read")).toBe(false);
    expect(hasScope(null, "read")).toBe(false);
    expect(hasScope("admin", "write")).toBe(false);
  });
});

describe("isApiKeyUsable", () => {
  const jetzt = new Date("2026-11-23T12:00:00Z");

  it("gueltig ohne Ablauf", () => {
    expect(isApiKeyUsable({}, jetzt)).toBe(true);
  });

  it("widerrufen ist immer ungueltig", () => {
    expect(isApiKeyUsable({ revokedAt: new Date("2026-11-01T00:00:00Z") }, jetzt)).toBe(false);
  });

  it("abgelaufen ist ungueltig, knapp davor noch gueltig", () => {
    expect(isApiKeyUsable({ expiresAt: new Date("2026-11-23T11:59:59Z") }, jetzt)).toBe(false);
    expect(isApiKeyUsable({ expiresAt: new Date("2026-11-23T12:00:01Z") }, jetzt)).toBe(true);
  });

  it("kaputtes Ablaufdatum gilt als abgelaufen (fail closed)", () => {
    expect(isApiKeyUsable({ expiresAt: "kein-datum" }, jetzt)).toBe(false);
  });
});

describe("expiresAtFromDays", () => {
  const jetzt = new Date("2026-11-23T00:00:00Z");

  it("rechnet Tage in ein Datum um", () => {
    expect(expiresAtFromDays(10, jetzt)?.toISOString()).toBe("2026-12-03T00:00:00.000Z");
  });

  it("ohne Angabe unbegrenzt", () => {
    expect(expiresAtFromDays(undefined, jetzt)).toBeNull();
    expect(expiresAtFromDays(null, jetzt)).toBeNull();
  });

  it("deckelt absurde Werte auf zehn Jahre", () => {
    const datum = expiresAtFromDays(999999, jetzt);
    expect(datum).not.toBeNull();
    const tage = Math.round(((datum as Date).getTime() - jetzt.getTime()) / 86_400_000);
    expect(tage).toBe(3650);
  });
});

describe("Label, Scope und Obergrenze", () => {
  it("trimmt Labels und weist leere ab", () => {
    expect(normalizeLabel("  CI-Schluessel ")).toBe("CI-Schluessel");
    expect(() => normalizeLabel("   ")).toThrow(ApiKeyError);
    expect(() => normalizeLabel("x".repeat(121))).toThrow(ApiKeyError);
  });

  it("normalisiert Scopes", () => {
    expect(normalizeScope("READ")).toBe("read");
    expect(normalizeScope(undefined)).toBe("write");
    expect(() => normalizeScope("admin")).toThrow(ApiKeyError);
  });

  it("begrenzt aktive Schluessel pro Konto", () => {
    expect(canCreateKey(0)).toBe(true);
    expect(canCreateKey(MAX_ACTIVE_KEYS_PER_TENANT - 1)).toBe(true);
    expect(canCreateKey(MAX_ACTIVE_KEYS_PER_TENANT)).toBe(false);
  });
});

describe("maskApiKey", () => {
  it("zeigt nur den Anfang", () => {
    const key = generateApiKey();
    const maskiert = maskApiKey(key.keyPrefix);
    expect(maskiert.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(maskiert).not.toContain(key.plaintext.slice(-10));
    expect(maskiert.endsWith("…")).toBe(true);
  });
});

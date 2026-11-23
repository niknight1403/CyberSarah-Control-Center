/**
 * Block 2 (Multi-Tenancy) — API-Schluessel je Konto, reine Logik ohne Datenbank.
 *
 * Regeln, die hier (und damit testbar) festliegen:
 *  - Ein Schluessel gehoert genau einem Konto (ownerOpenId) und wird nur einmal
 *    im Klartext ausgeliefert (bei der Erstellung). Gespeichert wird ausschliesslich
 *    der SHA-256-Hash plus ein kurzes Prefix fuer die Anzeige.
 *  - Scope "write" schliesst "read" ein, "read" niemals "write".
 *  - Widerrufene oder abgelaufene Schluessel sind ungueltig, auch wenn der Hash passt.
 *  - Ein Konto hat eine Obergrenze aktiver Schluessel; das verhindert, dass ein
 *    versehentlicher Loop die Tabelle flutet.
 */

import { createHash, randomBytes } from "node:crypto";

/** Praefix macht Schluessel im Log erkennbar, ohne sie zu verraten. */
export const API_KEY_PREFIX = "ccc_live_";
/** Praefix + 43 Zeichen base64url (32 Byte Zufall). */
export const API_KEY_LENGTH = API_KEY_PREFIX.length + 43;
/** Sichtbarer Anfang eines Schluessels in Listen (nie der ganze Schluessel). */
export const API_KEY_DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 4;
export const MAX_ACTIVE_KEYS_PER_TENANT = 20;
export const MAX_LABEL_LENGTH = 120;

export type ApiKeyScope = "read" | "write";

export type GeneratedApiKey = {
  /** Einmalig im Klartext — wird nie gespeichert. */
  plaintext: string;
  /** Anfang des Schluessels fuer die Anzeige. */
  keyPrefix: string;
  /** SHA-256 hex, das einzige, was in der Datenbank landet. */
  keyHash: string;
};

export class ApiKeyError extends Error {
  constructor(
    public readonly code: "invalid-format" | "invalid-label" | "limit-reached" | "invalid-scope",
    message: string,
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function keyPrefixOf(plaintext: string): string {
  return plaintext.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

/** Erzeugt einen neuen Schluessel; Zufall ist injizierbar fuer Tests. */
export function generateApiKey(random: () => string = randomToken): GeneratedApiKey {
  const plaintext = `${API_KEY_PREFIX}${random()}`;
  return { plaintext, keyPrefix: keyPrefixOf(plaintext), keyHash: hashApiKey(plaintext) };
}

/**
 * Formpruefung, bevor irgendetwas die Datenbank beruehrt. Verhindert, dass
 * fremde Bearer-Tokens (Session-JWT) oder Muelleingaben als API-Key gelten.
 */
export function isValidApiKeyFormat(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith(API_KEY_PREFIX)) return false;
  if (trimmed.length !== API_KEY_LENGTH) return false;
  const rest = trimmed.slice(API_KEY_PREFIX.length);
  return /^[A-Za-z0-9_-]+$/.test(rest);
}

/** Anzeigeform: "ccc_live_ab12…" — nie der vollstaendige Schluessel. */
export function maskApiKey(keyPrefix: string): string {
  return `${keyPrefix}…`;
}

export function normalizeLabel(label: unknown): string {
  const value = typeof label === "string" ? label.trim() : "";
  if (!value) throw new ApiKeyError("invalid-label", "Bitte einen Namen fuer den Schluessel angeben.");
  if (value.length > MAX_LABEL_LENGTH) {
    throw new ApiKeyError("invalid-label", `Der Name darf hoechstens ${MAX_LABEL_LENGTH} Zeichen haben.`);
  }
  return value;
}

export function normalizeScope(scope: unknown): ApiKeyScope {
  const value = typeof scope === "string" ? scope.trim().toLowerCase() : "write";
  if (value !== "read" && value !== "write") {
    throw new ApiKeyError("invalid-scope", "Erlaubt sind die Scopes 'read' und 'write'.");
  }
  return value;
}

/** "write" darf lesen, "read" nicht schreiben. */
export function hasScope(storedScope: string | null | undefined, required: ApiKeyScope): boolean {
  const scope = (storedScope ?? "").trim().toLowerCase();
  if (required === "read") return scope === "read" || scope === "write";
  return scope === "write";
}

export type ApiKeyState = {
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

/** Gueltig = nicht widerrufen und nicht abgelaufen. */
export function isApiKeyUsable(state: ApiKeyState, now: Date = new Date()): boolean {
  if (state.revokedAt) return false;
  if (!state.expiresAt) return true;
  const expiry = state.expiresAt instanceof Date ? state.expiresAt : new Date(state.expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() > now.getTime();
}

/** Ablaufdatum aus "gueltig fuer X Tage"; null = unbegrenzt. */
export function expiresAtFromDays(days: unknown, now: Date = new Date()): Date | null {
  if (days === null || days === undefined) return null;
  const value = typeof days === "number" ? days : Number(days);
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  const capped = Math.min(Math.floor(value), 3650);
  return new Date(now.getTime() + capped * 24 * 60 * 60 * 1000);
}

export function canCreateKey(activeCount: number): boolean {
  return activeCount < MAX_ACTIVE_KEYS_PER_TENANT;
}

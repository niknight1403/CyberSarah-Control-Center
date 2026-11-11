/**
 * CyberSarah Control Center — MCP-Credential-Logik (Sprint 4)
 *
 * Reine, testbare Logik des Credential Vaults (Mission-Modul 2):
 *
 *   - Quellenauflösung: expliziter Vault-Eintrag vor ENV-Fallback, mit
 *     ehrlicher Fehlermeldung statt stiller Leere.
 *   - Maskierung: nie der Klartext, auch nicht bei kurzen Werten.
 *   - OAuth2 Client-Credentials: Request bauen (nur HTTPS, Zugangsdaten
 *     ausschließlich in Header/Body, nie in der URL) und Antwort parsen.
 *   - Frischeprüfung mit Sicherheitsabstand, damit ein Token nicht mitten
 *     im Aufruf abläuft.
 *   - Statusbeschreibung für Healthchecks.
 *
 * Kein IO, keine Netzwerkzugriffe: Verschlüsselung und HTTP injiziert der
 * Service.
 */

export type CredentialKind = "bearer" | "api_key" | "oauth2_client_credentials";

export const CREDENTIAL_KINDS: readonly CredentialKind[] = ["bearer", "api_key", "oauth2_client_credentials"];

export type CredentialSource = "vault" | "env" | "none";

export interface CredentialResolution {
  source: CredentialSource;
  /** Nur bei source !== "none" gesetzt. */
  value: string | null;
  reason: string | null;
}

/** Vault vor ENV: ein bewusst gesetzter, rotierbarer Wert schlägt die Umgebung. */
export function resolveCredentialSource(input: {
  envVarName?: string | null;
  env?: Record<string, string | undefined>;
  hasVaultEntry: boolean;
}): CredentialResolution {
  if (input.hasVaultEntry) {
    return { source: "vault", value: null, reason: null };
  }
  const envVar = input.envVarName?.trim();
  if (envVar) {
    const value = input.env?.[envVar]?.trim();
    if (value) return { source: "env", value, reason: null };
    return {
      source: "none",
      value: null,
      reason: `Zugangsdaten fehlen: ENV ${envVar} ist nicht gesetzt und im Vault liegt kein Eintrag.`,
    };
  }
  return {
    source: "none",
    value: null,
    reason: "Zugangsdaten fehlen: weder ENV-Referenz noch Vault-Eintrag vorhanden.",
  };
}

/** Vorschau: erste 3 und letzte 2 Zeichen, kurze Werte vollständig maskiert. */
export function maskCredential(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "•".repeat(Math.max(4, trimmed.length));
  return `${trimmed.slice(0, 3)}${"•".repeat(6)}${trimmed.slice(-2)}`;
}

export function isValidCredentialValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.trim().length <= 8192;
}

export function isValidTokenUrl(url: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Token-URL ist keine gültige URL." };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "Token-URL muss HTTPS verwenden." };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Zugangsdaten gehören nicht in die Token-URL." };
  }
  if (parsed.hostname === "localhost" || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(parsed.hostname)) {
    return { ok: false, reason: "Token-URL zeigt auf eine private Adresse (SSRF-Schutz)." };
  }
  return { ok: true };
}

export interface OAuthTokenRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

/**
 * Baut den Client-Credentials-Request. `client_secret_basic` ist der
 * Standard; zusätzlich steht `client_id`/`client_secret` im Body, weil einige
 * Anbieter nur das akzeptieren.
 */
export function buildOAuthTokenRequest(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes?: readonly string[];
  audience?: string;
}): { ok: true; request: OAuthTokenRequest } | { ok: false; reason: string } {
  const urlCheck = isValidTokenUrl(input.tokenUrl);
  if (!urlCheck.ok) return { ok: false, reason: urlCheck.reason ?? "Token-URL ungültig." };
  if (!input.clientId.trim()) return { ok: false, reason: "client_id fehlt." };
  if (!isValidCredentialValue(input.clientSecret)) return { ok: false, reason: "client_secret ist ungültig." };

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", input.clientId);
  body.set("client_secret", input.clientSecret);
  if (input.scopes && input.scopes.length > 0) body.set("scope", input.scopes.join(" "));
  if (input.audience) body.set("audience", input.audience);

  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`, "utf8").toString("base64");
  return {
    ok: true,
    request: {
      url: input.tokenUrl,
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    },
  };
}

export interface OAuthTokenResult {
  ok: boolean;
  accessToken: string | null;
  tokenType: string | null;
  scopes: string[];
  expiresAt: Date | null;
  reason: string | null;
}

/** Parst eine Token-Antwort; Fehlertexte werden auf 200 Zeichen gekürzt. */
export function parseOAuthTokenResponse(
  status: number,
  payload: unknown,
  nowMs: number,
): OAuthTokenResult {
  const fail = (reason: string): OAuthTokenResult => ({
    ok: false,
    accessToken: null,
    tokenType: null,
    scopes: [],
    expiresAt: null,
    reason: reason.slice(0, 200),
  });

  if (status < 200 || status >= 300) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as Record<string, unknown>).error)
        : `HTTP ${status}`;
    return fail(`Token-Endpunkt abgelehnt: ${detail}`);
  }
  if (!payload || typeof payload !== "object") return fail("Token-Antwort ist kein JSON-Objekt.");

  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.access_token === "string" ? record.access_token.trim() : "";
  if (!accessToken) return fail("Token-Antwort ohne access_token.");

  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : Number(record.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(nowMs + expiresIn * 1000) : null;
  const scopeRaw = typeof record.scope === "string" ? record.scope : "";

  return {
    ok: true,
    accessToken,
    tokenType: typeof record.token_type === "string" ? record.token_type : "Bearer",
    scopes: scopeRaw.split(/\s+/).filter(Boolean),
    expiresAt,
    reason: null,
  };
}

/** Sicherheitsabstand von 60 s: ein Token gilt kurz vor Ablauf als verbraucht. */
export const TOKEN_REFRESH_SKEW_MS = 60_000;

export function isTokenFresh(expiresAt: Date | null | undefined, nowMs: number, skewMs = TOKEN_REFRESH_SKEW_MS): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - skewMs > nowMs;
}

export type CredentialStatus = "missing" | "static" | "fresh" | "expiring" | "expired";

export function describeCredentialStatus(input: {
  hasSecret: boolean;
  kind: CredentialKind | null;
  expiresAt?: Date | null;
  nowMs: number;
  warnWindowMs?: number;
}): CredentialStatus {
  if (!input.hasSecret) return "missing";
  if (!input.kind || input.kind !== "oauth2_client_credentials") return "static";
  if (!input.expiresAt) return "static";
  const remaining = input.expiresAt.getTime() - input.nowMs;
  if (remaining <= 0) return "expired";
  const warnWindow = input.warnWindowMs ?? 10 * 60_000;
  return remaining <= warnWindow ? "expiring" : "fresh";
}

/** Maskierte Zusammenfassung für Listen und Logs (keine Geheimnisse). */
export function describeCredentialForList(entry: {
  serverKey: string;
  kind: CredentialKind;
  maskedPreview: string;
  expiresAt?: Date | null;
  updatedAt: Date;
}, nowMs: number): Record<string, string | null> {
  return {
    serverKey: entry.serverKey,
    kind: entry.kind,
    preview: entry.maskedPreview,
    status: describeCredentialStatus({
      hasSecret: true,
      kind: entry.kind,
      expiresAt: entry.expiresAt ?? null,
      nowMs,
    }),
    expiresAt: entry.expiresAt ? entry.expiresAt.toISOString() : null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/**
 * Sprint 370 — X-OAuth2-Auto-Refresh (Server-Service).
 *
 * Aufgaben:
 *   - liefert den aktuell gueltigen X-Access-Token (DB-Satz bevorzugt,
 *     Env-Bootstrap X_PUBLISH_TOKEN als Fallback),
 *   - stoesst rechtzeitig (Puffer) oder auf 401 (force) einen Refresh via
 *     grant_type=refresh_token an — Basic-Auth aus X_CLIENT_ID/X_CLIENT_SECRET,
 *   - persistiert den ROTIERTEN Tokensatz in platform_tokens, weil X bei
 *     jedem Refresh ALTE Tokens invalidiert (nur DB ueberlebt Neustarts).
 *
 * Reparatur 09.11.2026 (X-Token-Erneuerung):
 *   - Es gibt ZWEI Refresh-Token-Quellen (DB-Zeile und Env X_REFRESH_TOKEN).
 *     Bisher wurde nur eine probiert; ein toter DB-Satz blockierte jeden
 *     Refresh, obwohl in der Umgebung ein gueltiger Bootstrap lag. Jetzt werden
 *     beide Kandidaten der Reihe nach versucht (invalid_grant ist nicht endgueltig,
 *     solange ein anderer Kandidat existiert).
 *   - Ein bekannter massgeblich abgelaufener DB-Token wird NICHT mehr als
 *     Fallback zurueckgegeben (das erzeugte garantierte 401er beim Provider);
 *     stattdessen der Env-Bootstrap, sonst ehrlich null mit Grund.
 *   - Basic-Auth nach RFC 6749 prozentkodiert.
 *
 * Ehrlichkeit: Jeder Fehlschlag wird mit Grund protokolliert; der Aufrufer
 * (Publishing-Autopilot) faellt auf Sandbox/Fallback zurueck, statt zu crashen.
 */

import { eq } from "drizzle-orm";
import { create } from "axios";
import { platformTokens, type PlatformTokenRow } from "../drizzle/schema";
import { getDb } from "./db";
import {
  describeXRefreshFailure,
  parseXRefreshResponse,
  shouldRefreshXToken,
  xRefreshCooldownPassed,
  type XTokenSet,
} from "../lib/x-token-refresh-logic";

const X_TOKEN_HTTP_TIMEOUT_MS = 15_000;

let lastRefreshAttemptAt: Date | null = null;
let lastRefreshError: string | null = null;
let lastRefreshSucceededAt: Date | null = null;
/** Quelle des zuletzt erfolgreichen Refresh (db | env). Fuer Diagnose und Logs. */
let lastRefreshSource: "db" | "env" | null = null;

/** Nur fuer Tests: Cooldown- und Diagnosezustand zuruecksetzen. */
export function resetXTokenRefreshStateForTests(): void {
  lastRefreshAttemptAt = null;
  lastRefreshError = null;
  lastRefreshSucceededAt = null;
  lastRefreshSource = null;
}

export function xRefreshCredentialsPresent(): boolean {
  return Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim());
}

function tokenEndpointUrl(): string {
  return process.env.X_OAUTH_TOKEN_URL?.trim() || "https://api.x.com/2/oauth2/token";
}

type TokenStore = {
  load(): Promise<PlatformTokenRow | null>;
  save(set: XTokenSet): Promise<void>;
};

/** Produktiv-Store: platform_tokens-Zeile fuer X (Upsert auf Plattform-Schluessel). */
const dbTokenStore: TokenStore = {
  async load() {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(platformTokens).where(eq(platformTokens.platform, "x")).limit(1);
    return row ?? null;
  },
  async save(set) {
    const db = await getDb();
    if (!db) throw new Error("Datenbank nicht verfuegbar — rotierter X-Token kann nicht persistiert werden.");
    await db
      .insert(platformTokens)
      .values({ platform: "x", accessToken: set.accessToken, refreshToken: set.refreshToken, expiresAt: set.expiresAt })
      .onConflictDoUpdate({
        target: platformTokens.platform,
        set: { accessToken: set.accessToken, refreshToken: set.refreshToken, expiresAt: set.expiresAt, updatedAt: new Date() },
      });
  },
};

// Test-Hook (Muster wie setModelRouterKvForTests): In-Memory-Store statt vi.mock.
let testStore: TokenStore | null = null;
export function setXTokenStoreForTests(store: TokenStore | null): void {
  testStore = store;
}

function activeStore(): TokenStore {
  return testStore ?? dbTokenStore;
}

/**
 * Alle bekannten Refresh-Token-Kandidaten in Versuchsreihenfolge.
 * Der DB-Satz ist der zuletzt rotierte und damit der wahrscheinlichste; der
 * Env-Satz ist der Bootstrap und kann noch gueltig sein, wenn die DB-Zeile
 * aus einer abgebrochenen Rotation stammt.
 */
export function xRefreshTokenCandidates(row: PlatformTokenRow | null): Array<{ token: string; source: "db" | "env" }> {
  const candidates: Array<{ token: string; source: "db" | "env" }> = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined, source: "db" | "env") => {
    const token = (value ?? "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    candidates.push({ token, source });
  };
  push(row?.refreshToken, "db");
  push(process.env.X_REFRESH_TOKEN, "env");
  return candidates;
}

/** Fuehrt einen X-Refresh aus und persistiert den rotierten Satz. Wirft ehrlich. */
export async function refreshXToken(options: { now?: Date; force?: boolean } = {}): Promise<XTokenSet> {
  const now = options.now ?? new Date();
  const force = options.force ?? false;

  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("X-Refresh nicht moeglich: X_CLIENT_ID/X_CLIENT_SECRET fehlen in der Umgebung.");
  }
  if (!force && !xRefreshCooldownPassed(lastRefreshAttemptAt, now)) {
    throw new Error("X-Refresh im Cooldown — letzter Versuch liegt weniger als 5 Minuten zurueck.");
  }

  const store = activeStore();
  const row = await store.load();
  const candidates = xRefreshTokenCandidates(row);
  if (!candidates.length) {
    throw new Error("X-Refresh nicht moeglich: kein Refresh-Token (DB oder X_REFRESH_TOKEN).");
  }

  lastRefreshAttemptAt = now;
  const client = create({ timeout: X_TOKEN_HTTP_TIMEOUT_MS });
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await client.post(
        tokenEndpointUrl(),
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: candidate.token,
          client_id: clientId,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // RFC 6749, 2.3.1: client_id und client_secret vor der Kodierung escapen.
            Authorization: `Basic ${Buffer.from(
              `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
            ).toString("base64")}`,
          },
        },
      );
      const set = parseXRefreshResponse(response.data, now);
      await store.save(set);
      lastRefreshSucceededAt = now;
      lastRefreshError = null;
      lastRefreshSource = candidate.source;
      if (candidates.length > 1) {
        console.info(`[X-Token] Refresh ueber ${candidate.source}-Kandidat erfolgreich.`);
      }
      return set;
    } catch (error) {
      const status = (error as { response?: { status?: number; data?: unknown } })?.response?.status;
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      const message = describeXRefreshFailure(status, data);
      failures.push(`${candidate.source}: ${message}`);
      // 5xx/Netzfehler: der naechste Kandidat hilft nicht, der Endpunkt ist gestoert.
      if (status === undefined || status >= 500) break;
    }
  }

  const summary = failures.join(" | ");
  lastRefreshError = summary;
  console.warn(`[X-Token] Refresh fehlgeschlagen (${candidates.length} Kandidat(en)): ${summary}`);
  throw new Error(summary);
}

export type XTokenResolution = {
  token: string | null;
  refreshed: boolean;
  reason?: string;
};

/**
 * Liefert den aktuell besten X-Access-Token.
 *
 * Reihenfolge:
 *   1. DB-Satz, falls frisch (ausserhalb des Ablauf-Puffers) -> direkt nutzen.
 *   2. Auffrischen (Refresh), falls Credentials vorhanden und Cooldown ok.
 *   3. Ehrlicher Fallback: Env-Bootstrap bei abgelaufenem DB-Satz, sonst der
 *      DB-Satz (falls noch nicht nachweislich abgelaufen). Ein massgeblich
 *      abgelaufener DB-Token wird nie als gueltig ausgegeben.
 * force=true (401-Retry): nur ein FRISCHES Refresh akzeptieren — ein bekannt
 * ungueltiger Token wird nicht blind erneut gesendet.
 */
export async function resolveXToken(options: { now?: Date; force?: boolean } = {}): Promise<XTokenResolution> {
  const now = options.now ?? new Date();
  const force = options.force ?? false;
  const store = activeStore();
  const row = await store.load();

  if (row && !shouldRefreshXToken(row.expiresAt, now)) {
    return { token: row.accessToken, refreshed: false };
  }

  const hasRefreshCredentials = xRefreshCredentialsPresent();
  const hasRefreshToken = xRefreshTokenCandidates(row).length > 0;
  if (hasRefreshCredentials && hasRefreshToken && (force || xRefreshCooldownPassed(lastRefreshAttemptAt, now))) {
    try {
      const set = await refreshXToken({ now, force });
      return { token: set.accessToken, refreshed: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unbekannter Fehler";
      if (force) {
        // 401-Retry: kein blindes Wiederholen mit dem vermutlich toten Token.
        return { token: null, refreshed: false, reason };
      }
      console.warn(`[X-Token] Refresh fehlgeschlagen, falle auf Bestands-Token zurueck: ${reason}`);
    }
  }

  const envToken = process.env.X_PUBLISH_TOKEN?.trim() || null;
  const dbTokenExpired = Boolean(row?.expiresAt && row.expiresAt.getTime() <= now.getTime());
  if (row?.accessToken && !dbTokenExpired) {
    return {
      token: row.accessToken,
      refreshed: false,
      reason: "Bestands-Token trotz Ablauf-Puffer genutzt (Refresh nicht moeglich).",
    };
  }
  if (envToken) {
    return {
      token: envToken,
      refreshed: false,
      reason: row
        ? "DB-Token abgelaufen, Env-Bootstrap genutzt (Refresh fehlgeschlagen)."
        : "Env-Bootstrap-Token genutzt (Refresh nicht moeglich).",
    };
  }
  return {
    token: null,
    refreshed: false,
    reason: row?.accessToken
      ? "DB-Token ist abgelaufen, Refresh fehlgeschlagen und kein Env-Bootstrap vorhanden — Versand wuerde mit 401 scheitern."
      : "Kein X-Token verfuegbar (weder DB noch Umgebung).",
  };
}

export type XTokenDiagnostics = {
  credentialsPresent: boolean;
  refreshTokenSources: Array<"db" | "env">;
  storedTokenPresent: boolean;
  expiresAt: string | null;
  minutesLeft: number | null;
  needsRefresh: boolean;
  lastRefreshAttemptAt: string | null;
  lastRefreshSucceededAt: string | null;
  lastRefreshSource: "db" | "env" | null;
  lastRefreshError: string | null;
  ready: boolean;
  detail: string;
};

/** Betriebsdiagnose ohne Geheimnisse: sagt, ob ein Refresh aktuell moeglich ist. */
export async function xTokenDiagnostics(now = new Date()): Promise<XTokenDiagnostics> {
  const store = activeStore();
  const row = await store.load();
  const sources = xRefreshTokenCandidates(row).map((candidate) => candidate.source);
  const credentialsPresent = xRefreshCredentialsPresent();
  const needsRefresh = shouldRefreshXToken(row?.expiresAt ?? null, now);
  const minutesLeft = row?.expiresAt ? Math.round((row.expiresAt.getTime() - now.getTime()) / 60_000) : null;
  const ready = credentialsPresent && sources.length > 0;
  let detail: string;
  if (!credentialsPresent) detail = "X_CLIENT_ID/X_CLIENT_SECRET fehlen — Refresh ist nicht moeglich.";
  else if (!sources.length) detail = "Kein Refresh-Token vorhanden (weder DB noch X_REFRESH_TOKEN).";
  else if (lastRefreshError) detail = `Letzter Refresh fehlgeschlagen: ${lastRefreshError}`;
  else if (!row) detail = "Noch kein Tokensatz in der Datenbank — erster Refresh steht aus.";
  else if (needsRefresh) detail = "Refresh faellig.";
  else detail = "Token gueltig, kein Refresh noetig.";
  return {
    credentialsPresent,
    refreshTokenSources: sources,
    storedTokenPresent: Boolean(row?.accessToken),
    expiresAt: row?.expiresAt ? row.expiresAt.toISOString() : null,
    minutesLeft,
    needsRefresh,
    lastRefreshAttemptAt: lastRefreshAttemptAt ? lastRefreshAttemptAt.toISOString() : null,
    lastRefreshSucceededAt: lastRefreshSucceededAt ? lastRefreshSucceededAt.toISOString() : null,
    lastRefreshSource,
    lastRefreshError,
    ready,
    detail,
  };
}

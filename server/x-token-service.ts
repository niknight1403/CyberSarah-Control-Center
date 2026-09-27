/**
 * Sprint 370 — X-OAuth2-Auto-Refresh (Server-Service).
 *
 * Aufgaben:
 *   - liefert den aktuell gueltigen X-Access-Token (DB-Satz bevorzugt,
 *     Env-Bootstrap X_PUBLISH_TOKEN als Fallback),
 *   - stoesst rechtzeitig (Puffer) oder auf 401 (force) einen Refresh via
 *     grant_type=refresh_token an — Basic-Auth aus X_CLIENT_ID/X_CLIENT_SECRET,
 *     Refresh-Token aus der platform_tokens-Zeile oder Env X_REFRESH_TOKEN,
 *   - persistiert den ROTIERTEN Tokensatz in platform_tokens, weil X bei
 *     jedem Refresh ALTE Tokens invalidiert (nur DB ueberlebt Neustarts).
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

/** Nur fuer Tests: Cooldown-Zustand zuruecksetzen. */
export function resetXTokenRefreshStateForTests(): void {
  lastRefreshAttemptAt = null;
}

export function xRefreshCredentialsPresent(): boolean {
  return Boolean(
    process.env.X_CLIENT_ID?.trim() &&
      process.env.X_CLIENT_SECRET?.trim() &&
      (process.env.X_REFRESH_TOKEN?.trim() || true), // Refresh-Token kann auch nur in der DB liegen
  );
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
  const refreshToken = row?.refreshToken ?? process.env.X_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    throw new Error("X-Refresh nicht moeglich: kein Refresh-Token (DB oder X_REFRESH_TOKEN).");
  }

  lastRefreshAttemptAt = now;
  const client = create({ timeout: X_TOKEN_HTTP_TIMEOUT_MS });
  let response;
  try {
    response = await client.post(
      tokenEndpointUrl(),
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
      },
    );
  } catch (error) {
    const status = (error as { response?: { status?: number; data?: unknown } })?.response?.status;
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    throw new Error(describeXRefreshFailure(status, data));
  }

  const set = parseXRefreshResponse(response.data, now);
  await store.save(set);
  return set;
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
 *   3. Ehrlicher Fallback: DB-Satz (trotz Puffer) oder Env-Bootstrap,
 *      damit ein voruebergehender Refresh-Fehler den Betrieb nicht stoppt.
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

  const hasRefreshCredentials = Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim());
  const hasRefreshToken = Boolean(row?.refreshToken || process.env.X_REFRESH_TOKEN?.trim());
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

  const fallback = row?.accessToken ?? process.env.X_PUBLISH_TOKEN?.trim() ?? null;
  return {
    token: fallback || null,
    refreshed: false,
    reason: fallback
      ? row
        ? "Bestands-Token trotz Ablauf-Puffer genutzt (Refresh nicht moeglich)."
        : "Env-Bootstrap-Token genutzt (Refresh nicht moeglich)."
      : "Kein X-Token verfuegbar (weder DB noch Umgebung).",
  };
}

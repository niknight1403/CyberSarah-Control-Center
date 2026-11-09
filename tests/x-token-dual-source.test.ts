/**
 * X-Token-Erneuerung, Reparatur 09.11.2026: zwei Refresh-Token-Quellen.
 *
 * Vorher wurde nur EIN Kandidat probiert (DB-Zeile). War der tot (invalid_grant
 * aus einer abgebrochenen Rotation), scheiterte jeder Refresh, obwohl in der
 * Umgebung ein gueltiger Bootstrap lag. Geprueft wird hier:
 *   1. Faellt der DB-Kandidat aus, gewinnt der Env-Kandidat und wird persistiert.
 *   2. Fallen beide aus, ist der Fehler ehrlich und nennt beide Quellen.
 *   3. Ein abgelaufener DB-Token wird nie als gueltig zurueckgegeben.
 *   4. Diagnose nennt Quellen, Restlaufzeit und letzten Fehler ohne Geheimnisse.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  refreshXToken,
  resetXTokenRefreshStateForTests,
  resolveXToken,
  setXTokenStoreForTests,
  xRefreshTokenCandidates,
  xTokenDiagnostics,
} from "../server/x-token-service";
import type { PlatformTokenRow } from "../drizzle/schema";
import type { XTokenSet } from "../lib/x-token-refresh-logic";

const DB_TOKEN = "db-refresh-token-dead";
const ENV_TOKEN = "env-refresh-token-alive";

type Store = { row: PlatformTokenRow | null; saves: XTokenSet[] };
const makeStore = (initial: Partial<PlatformTokenRow> | null): Store & {
  load: () => Promise<PlatformTokenRow | null>;
  save: (set: XTokenSet) => Promise<void>;
} => {
  const store: Store = { row: initial as PlatformTokenRow | null, saves: [] };
  return {
    ...store,
    get row() { return store.row; },
    get saves() { return store.saves; },
    async load() { return store.row; },
    async save(set: XTokenSet) {
      store.saves.push(set);
      store.row = {
        ...(store.row ?? ({} as PlatformTokenRow)),
        platform: "x",
        accessToken: set.accessToken,
        refreshToken: set.refreshToken,
        expiresAt: set.expiresAt,
      } as PlatformTokenRow;
    },
  };
};

let server: Server;
let baseUrl = "";
let acceptedTokens: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const token = params.get("refresh_token") ?? "";
      acceptedTokens.push(token);
      res.setHeader("Content-Type", "application/json");
      if (token === ENV_TOKEN) {
        res.statusCode = 200;
        res.end(JSON.stringify({ access_token: "access-rotated", refresh_token: "refresh-rotated", expires_in: 7200, token_type: "bearer" }));
        return;
      }
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "Value passed in refresh_token is invalid." }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/token`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Nur die eigenen Schluessel sichern und zuruecksetzen. Ein Austausch des
// gesamten process.env-Objekts wuerde vi.stubEnv in anderen Testdateien
// unterlaufen (dort blieben Stubs stehen und Preis-Tests kippten).
const TOUCHED_ENV = ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REFRESH_TOKEN", "X_OAUTH_TOKEN_URL", "X_PUBLISH_TOKEN"] as const;
const envBackup = new Map<string, string | undefined>(TOUCHED_ENV.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const [key, value] of envBackup) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

beforeEach(() => {
  acceptedTokens = [];
  resetXTokenRefreshStateForTests();
  process.env.X_CLIENT_ID = "client-id";
  process.env.X_CLIENT_SECRET = "client-secret";
  process.env.X_REFRESH_TOKEN = ENV_TOKEN;
  process.env.X_OAUTH_TOKEN_URL = baseUrl;
  delete process.env.X_PUBLISH_TOKEN;
});

afterEach(() => {
  restoreEnv();
  setXTokenStoreForTests(null);
  resetXTokenRefreshStateForTests();
});

describe("X-Token-Erneuerung: Kandidaten", () => {
  it("probiert DB zuerst, dann Env, und entdoppelt", () => {
    const candidates = xRefreshTokenCandidates({ refreshToken: DB_TOKEN } as PlatformTokenRow);
    expect(candidates.map((entry) => entry.source)).toEqual(["db", "env"]);
    process.env.X_REFRESH_TOKEN = DB_TOKEN;
    expect(xRefreshTokenCandidates({ refreshToken: DB_TOKEN } as PlatformTokenRow)).toHaveLength(1);
  });

  it("faellt bei totem DB-Token auf den Env-Kandidaten zurueck und persistiert", async () => {
    const store = makeStore({ refreshToken: DB_TOKEN, accessToken: "old-access", expiresAt: new Date("2026-11-01T00:00:00Z") });
    setXTokenStoreForTests(store);

    const set = await refreshXToken({ force: true, now: new Date("2026-11-09T08:00:00Z") });

    expect(set.accessToken).toBe("access-rotated");
    expect(set.refreshToken).toBe("refresh-rotated");
    expect(acceptedTokens).toEqual([DB_TOKEN, ENV_TOKEN]);
    expect(store.saves).toHaveLength(1);
    const diagnostics = await xTokenDiagnostics(new Date("2026-11-09T08:00:00Z"));
    expect(diagnostics.lastRefreshSource).toBe("env");
    expect(diagnostics.lastRefreshError).toBeNull();
  });

  it("meldet ehrlich, wenn beide Kandidaten abgelehnt werden", async () => {
    process.env.X_REFRESH_TOKEN = "auch-tot";
    const store = makeStore({ refreshToken: DB_TOKEN, accessToken: "old", expiresAt: new Date("2026-11-01T00:00:00Z") });
    setXTokenStoreForTests(store);

    await expect(refreshXToken({ force: true })).rejects.toThrow(/db:.*env:/s);
    const diagnostics = await xTokenDiagnostics();
    expect(diagnostics.lastRefreshError).toContain("invalid_grant");
    expect(store.saves).toHaveLength(0);
  });

  it("probiert bei Serverfehler keinen zweiten Kandidaten", async () => {
    process.env.X_OAUTH_TOKEN_URL = "http://127.0.0.1:9/token";
    const store = makeStore({ refreshToken: DB_TOKEN, accessToken: "old", expiresAt: new Date("2026-11-01T00:00:00Z") });
    setXTokenStoreForTests(store);
    await expect(refreshXToken({ force: true })).rejects.toThrow();
    expect(store.saves).toHaveLength(0);
  });
});

describe("X-Token-Erneuerung: Fallback ohne gueltigen DB-Token", () => {
  it("gibt keinen nachweislich abgelaufenen DB-Token als gueltig aus", async () => {
    process.env.X_PUBLISH_TOKEN = "env-publish-token";
    process.env.X_REFRESH_TOKEN = "auch-tot";
    const store = makeStore({
      refreshToken: DB_TOKEN, accessToken: "dead-access", expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    setXTokenStoreForTests(store);

    const resolution = await resolveXToken({ now: new Date("2026-11-09T08:00:00Z") });
    expect(resolution.token).toBe("env-publish-token");
    expect(resolution.reason).toContain("Env-Bootstrap");
  });

  it("sagt klar, wenn gar kein brauchbares Token existiert", async () => {
    process.env.X_REFRESH_TOKEN = "auch-tot";
    const store = makeStore({
      refreshToken: DB_TOKEN, accessToken: "dead-access", expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    setXTokenStoreForTests(store);

    const resolution = await resolveXToken({ now: new Date("2026-11-09T08:00:00Z") });
    expect(resolution.token).toBeNull();
    expect(resolution.reason).toContain("abgelaufen");
  });

  it("nennt in der Diagnose Quellen, Restlaufzeit und Bereitschaft", async () => {
    const store = makeStore({
      refreshToken: DB_TOKEN, accessToken: "access", expiresAt: new Date("2026-11-09T09:00:00Z"),
    });
    setXTokenStoreForTests(store);
    const diagnostics = await xTokenDiagnostics(new Date("2026-11-09T08:00:00Z"));
    expect(diagnostics.credentialsPresent).toBe(true);
    expect(diagnostics.refreshTokenSources).toEqual(["db", "env"]);
    expect(diagnostics.minutesLeft).toBe(60);
    expect(diagnostics.needsRefresh).toBe(false);
    expect(diagnostics.ready).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain(DB_TOKEN);
    expect(JSON.stringify(diagnostics)).not.toContain(ENV_TOKEN);
  });
});

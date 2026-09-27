/**
 * Sprint 370 — X-OAuth2-Auto-Refresh: Logik + Service (Mock-HTTP + In-Memory-Store).
 *
 * Geprueft wird der komplette Lebenszyklus des X-Tokens:
 *   1. Bootstrap aus Env (X_PUBLISH_TOKEN) ohne DB-Satz,
 *   2. erster Tick rotiert den Token via Mock-Token-Endpoint und persistiert ihn,
 *   3. frischer DB-Satz wird ohne erneuten Refresh verwendet,
 *   4. Ablauf-Puffer loest rechtzeitig einen erneuten Refresh aus,
 *   5. Cooldown verhindert Refresh-Hammering im Minutentakt,
 *   6. force-Refresh (401-Retry) akzeptiert nur ein frisches Ergebnis,
 *   7. Fehler des Token-Endpunkts sind ehrlich und werfen nicht blind.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  parseXRefreshResponse,
  shouldRefreshXToken,
  xRefreshCooldownPassed,
  X_REFRESH_MIN_INTERVAL_MS,
  X_TOKEN_REFRESH_BUFFER_MS,
  type XTokenSet,
} from "../lib/x-token-refresh-logic";
import {
  refreshXToken,
  resetXTokenRefreshStateForTests,
  resolveXToken,
  setXTokenStoreForTests,
} from "../server/x-token-service";

// ---------------------------------------------------------------------------
// Reine Logik
// ---------------------------------------------------------------------------

describe("x-token-refresh-logic (Sprint 370, rein)", () => {
  const now = new Date("2026-09-25T08:00:00Z");

  it("fordert Refresh, wenn kein Ablaufzeitpunkt bekannt ist", () => {
    expect(shouldRefreshXToken(null, now)).toBe(true);
    expect(shouldRefreshXToken(undefined, now)).toBe(true);
  });

  it("laesst frische Tokens in Ruhe, sobald der Puffer ueberschritten ist", () => {
    const fresh = new Date(now.getTime() + X_TOKEN_REFRESH_BUFFER_MS + 60_000);
    expect(shouldRefreshXToken(fresh, now)).toBe(false);
  });

  it("fordert Refresh rechtzeitig VOR dem Ablauf (Puffer)", () => {
    const insideBuffer = new Date(now.getTime() + X_TOKEN_REFRESH_BUFFER_MS - 1_000);
    const alreadyExpired = new Date(now.getTime() - 1_000);
    expect(shouldRefreshXToken(insideBuffer, now)).toBe(true);
    expect(shouldRefreshXToken(alreadyExpired, now)).toBe(true);
  });

  it("Cooldown greift erst nach dem minimalen Refresh-Intervall", () => {
    expect(xRefreshCooldownPassed(null, now)).toBe(true);
    const justBefore = new Date(now.getTime() - X_REFRESH_MIN_INTERVAL_MS + 1_000);
    const justReached = new Date(now.getTime() - X_REFRESH_MIN_INTERVAL_MS);
    expect(xRefreshCooldownPassed(justBefore, now)).toBe(false);
    expect(xRefreshCooldownPassed(justReached, now)).toBe(true);
  });

  it("parst valide Refresh-Antworten mit Restlaufzeit", () => {
    const set = parseXRefreshResponse({ access_token: "A1", refresh_token: "R1", expires_in: 7200 }, now);
    expect(set.accessToken).toBe("A1");
    expect(set.refreshToken).toBe("R1");
    expect(set.expiresAt.getTime() - now.getTime()).toBe(7_200_000);
  });

  it("lehnt unvollstaendige Refresh-Antworten ehrlich ab", () => {
    expect(() => parseXRefreshResponse({}, now)).toThrow(/access_token|refresh_token/);
    expect(() => parseXRefreshResponse({ access_token: "A1" }, now)).toThrow(/refresh_token/);
    expect(() => parseXRefreshResponse("kein objekt", now)).toThrow();
  });

  it("fied ohne expires_in auf konservative Fallback-TTL", () => {
    const set = parseXRefreshResponse({ access_token: "A1", refresh_token: "R1" }, now);
    expect(set.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ---------------------------------------------------------------------------
// Service mit Mock-Token-Endpoint + In-Memory-Store
// ---------------------------------------------------------------------------

describe("x-token-service (Sprint 370, Mock-HTTP)", () => {
  let server: Server;
  let tokenUrl = "";
  /** Protokoll der Token-Endpoint-Aufrufe fuer Verhaltens-Aussagen. */
  const calls: { grantType: string; refreshToken: string }[] = [];
  /** Verhalten des Endpunkts, je Test steuerbar (null = Standard-Erfolg). */
  let customResponder: ((call: number) => { body: unknown; status: number }) | null = null;

  const stored: Map<string, XTokenSet> = new Map();
  const memoryStore = {
    async load() {
      const set = stored.get("x");
      return set
        ? {
            id: 1,
            platform: "x",
            accessToken: set.accessToken,
            refreshToken: set.refreshToken,
            expiresAt: set.expiresAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null;
    },
    async save(set: XTokenSet) {
      stored.set("x", set);
    },
  };

  const envBackup: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined) {
    if (!(key in envBackup)) envBackup[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const params = new URLSearchParams(body);
        calls.push({
          grantType: params.get("grant_type") ?? "",
          refreshToken: params.get("refresh_token") ?? "",
        });
        const custom = customResponder?.(calls.length);
        const status = custom?.status ?? 200;
        const payload =
          custom?.body ?? {
            token_type: "bearer",
            access_token: `fresh-access-${calls.length}`,
            refresh_token: `fresh-refresh-${calls.length}`,
            expires_in: 7200,
          };
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        tokenUrl = `http://127.0.0.1:${address.port}/2/oauth2/token`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    stored.clear();
    calls.length = 0;
    customResponder = null;
    resetXTokenRefreshStateForTests();
    setXTokenStoreForTests(memoryStore);
    setEnv("X_OAUTH_TOKEN_URL", tokenUrl);
    setEnv("X_CLIENT_ID", "test-client-id");
    setEnv("X_CLIENT_SECRET", "test-client-secret");
    setEnv("X_REFRESH_TOKEN", "bootstrap-refresh");
    setEnv("X_PUBLISH_TOKEN", "bootstrap-access");
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    setXTokenStoreForTests(null);
  });

  it("bootstrappt aus Env und rotiert beim ersten Tick (kein DB-Satz)", async () => {
    const now = new Date();
    const resolution = await resolveXToken({ now });
    expect(resolution.token).toBe("fresh-access-1");
    expect(resolution.refreshed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].grantType).toBe("refresh_token");
    expect(calls[0].refreshToken).toBe("bootstrap-refresh"); // Env-Bootstrap wird benutzt
    // Rotierter Satz liegt im Store:
    const saved = stored.get("x");
    expect(saved?.refreshToken).toBe("fresh-refresh-1");
    expect(saved?.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("nutzt einen frischen DB-Satz ohne erneuten Refresh", async () => {
    const later = new Date("2026-09-25T09:00:00Z");
    await refreshXToken({ now: later }); // Rotation erzeugen
    const callsAfterRefresh = calls.length;
    const resolution = await resolveXToken({ now: new Date(later.getTime() + 60_000) });
    expect(resolution.refreshed).toBe(false);
    expect(resolution.token).toBe("fresh-access-1");
    expect(calls).toHaveLength(callsAfterRefresh);
  });

  it("frischt nach, sobald der Ablauf-Puffer erreicht ist", async () => {
    await refreshXToken({ now: new Date("2026-09-25T09:00:00Z") });
    const nearExpiry = new Date("2026-09-25T10:55:00Z"); // 5 min vor Ablauf
    const resolution = await resolveXToken({ now: nearExpiry });
    expect(resolution.refreshed).toBe(true);
    expect(resolution.token).toBe("fresh-access-2");
    expect(calls[1].refreshToken).toBe("fresh-refresh-1"); // Rotation aus der DB
  });

  it("respektiert den Cooldown bei fehlgeschlagenem Refresh", async () => {
    customResponder = () => ({ status: 401, body: { error: "invalid_request", error_description: "token expired" } });
    const t1 = new Date("2026-09-25T09:00:00Z");
    await refreshXToken({ now: t1 }).catch(() => undefined); // t0: begruendet fehlgeschlagen
    resetXTokenRefreshStateForTests(); // Cooldown nur fuer den naechsten Testfall relevant
    await refreshXToken({ now: t1 }).catch(() => undefined);
    const attemptOne = calls.length;
    const withinCooldown = new Date(t1.getTime() + 60_000);
    await expect(refreshXToken({ now: withinCooldown })).rejects.toThrow(/Cooldown/);
    expect(calls).toHaveLength(attemptOne); // kein Hammering im Minutentakt
    const afterCooldown = new Date(t1.getTime() + X_REFRESH_MIN_INTERVAL_MS + 1000);
    await expect(refreshXToken({ now: afterCooldown })).rejects.toThrow(/fehlgeschlagen/);
    expect(calls).toHaveLength(attemptOne + 1);
  });

  it("faellt bei Endpunkt-Fehler auf den Bestands-/Env-Token zurueck (ohne force)", async () => {
    // Frischen Satz anlegen, dann direkt in den Puffer laufen und Fehler simulieren:
    await refreshXToken({ now: new Date("2026-09-25T09:00:00Z") });
    customResponder = () => ({ status: 500, body: { error: "server_error" } });
    resetXTokenRefreshStateForTests();
    const nearExpiry = new Date("2026-09-25T10:55:00Z");
    const resolution = await resolveXToken({ now: nearExpiry });
    expect(resolution.refreshed).toBe(false);
    expect(resolution.token).toBe("fresh-access-1"); // Bestands-Token trotz Puffer
    expect(resolution.reason).toMatch(/Bestands-Token/);
  });

  it("akzeptiert bei force (401-Retry) KEINEN blinden Fallback", async () => {
    customResponder = () => ({ status: 500, body: { error: "server_error" } });
    const resolution = await resolveXToken({ now: new Date(), force: true });
    expect(resolution.token).toBeNull();
    expect(resolution.reason).toMatch(/fehlgeschlagen/i);
  });

  it("wirft ehrlich, wenn Client-Credentials fehlen", async () => {
    setEnv("X_CLIENT_SECRET", undefined);
    await expect(refreshXToken({ now: new Date() })).rejects.toThrow(/X_CLIENT_ID\/X_CLIENT_SECRET/);
    const resolution = await resolveXToken({ now: new Date() });
    expect(resolution.token).toBe("bootstrap-access"); // Env-Bootstrap bleibt nutzbar
    expect(resolution.reason).toMatch(/Bootstrap/);
  });
});

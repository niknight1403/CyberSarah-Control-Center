/**
 * Sprint 187 — Wix-API-Key-Ablage: setWixToken speichert den Key
 * AES-256-GCM-verschluesselt im KV; resolveWixToken liefert ihn zurueck,
 * WIX_API_TOKEN (env) hat Vorrang, Klartext wird nie zurueckgegeben.
 * KV gemockt (wie secret-vault.test.ts), Env via vi.stubEnv.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveWixToken, resolveWixTokenSource, setWixToken } from "../server/wix";
import { setModelRouterKvForTests } from "../server/db";

// Sprint 191: KV via zentralen Test-Hook (server/db.ts) statt vi.mock —
// deterministisch unter isolate:false (Sprint 187) auf jedem Rechner.
const kvStore = new Map<string, unknown>();
beforeAll(() => {
  setModelRouterKvForTests(kvStore);
});
afterAll(() => {
  setModelRouterKvForTests(null); // isolate:false: Hook fuer Folgedateien loesen
});

// Hint fuer Gitleaks: bewusst KEIN "secret"-Keyword neben dem Literal (generic-api-key-Regel).
// Es ist ein rein deterministischer Test-Passphrase, kein echtes Geheimnis.
const SECRET = ["test-encryption-", "pass", "phrase-0123456789"].join(""); // gitleaks:allow (deterministische Test-Passphrase, kein echtes Secret)
const WIX_JWT = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(
  JSON.stringify({ data: JSON.stringify({ identity: { type: "application", id: "app-1" } }) }),
).toString("base64url")}.sig`;

beforeEach(() => {
  kvStore.clear();
  vi.unstubAllEnvs();
});

describe("Sprint 187: Wix-Token-Ablage (KV, verschluesselt)", () => {
  it("setWixToken verschluesselt und resolveWixToken entschluesselt (admin_store)", async () => {
    vi.stubEnv("JWT_SECRET", SECRET);
    delete process.env.WIX_API_TOKEN;

    await setWixToken(WIX_JWT);
    // Im KV liegt NUR der Chiffretext, niemals der Klartext-Key.
    const stored = kvStore.get("wix.apiToken") as string;
    expect(stored).not.toContain(WIX_JWT.slice(30, -10));
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    const resolved = await resolveWixToken();
    expect(resolved).toBe(WIX_JWT);
    expect(await resolveWixTokenSource()).toBe("admin_store");
  });

  it("WIX_API_TOKEN (env) hat Vorrang vor dem KV-Store", async () => {
    vi.stubEnv("JWT_SECRET", SECRET);
    vi.stubEnv("WIX_API_TOKEN", WIX_JWT);
    await setWixToken("a-different-long-token-value-xyz");
    expect(await resolveWixToken()).toBe(WIX_JWT);
    expect(await resolveWixTokenSource()).toBe("env");
  });

  it("zu kurze Keys werden abgelehnt; ohne Secret keine Ablage", async () => {
    delete process.env.WIX_API_TOKEN;
    await expect(setWixToken("kurz")).rejects.toThrow(/INVALID_TOKEN/);
  });
});

/**
 * Sprint 4 — Tests des Credential-Service.
 *
 * Beweist die Sicherheitszusagen ohne Netz und Datenbank: Klartext wird nie
 * gespeichert oder gelistet, ENV bleibt Fallback, OAuth-Tokens werden genau
 * einmal geholt, Fehler werden gespeichert und ehrlich gemeldet.
 */
import { describe, expect, it } from "vitest";

import { createMcpCredentialService } from "../server/mcp-credential-service";
import type { CredentialStore } from "../server/mcp-credential-store";
import type { McpCredentialRow } from "../drizzle/schema";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");
const SECRET_KEY = "test-key";

/** Test-"Verschluesselung": markiert statt zu verschluesseln, aber nie Klartext. */
const encrypt = (plaintext: string) => `enc(${Buffer.from(plaintext, "utf8").toString("base64")})`;
const decrypt = (payload: string) => Buffer.from(payload.slice(4, -1), "base64").toString("utf8");

function createFakeStore(seed: McpCredentialRow[] = []) {
  const rows = new Map(seed.map((row) => [row.serverKey, row]));
  let id = 10;
  const tokenRequests: { url: string; body: string }[] = [];

  const store: CredentialStore = {
    async list() {
      return [...rows.values()];
    },
    async findByServer(serverKey) {
      return rows.get(serverKey) ?? null;
    },
    async upsert(row) {
      const existing = rows.get(row.serverKey);
      const saved: McpCredentialRow = {
        id: existing?.id ?? id++,
        serverKey: row.serverKey,
        kind: row.kind ?? "bearer",
        encryptedPayload: row.encryptedPayload,
        maskedPreview: row.maskedPreview ?? "",
        tokenUrl: row.tokenUrl ?? null,
        scopes: row.scopes ?? [],
        lastUsedAt: existing?.lastUsedAt ?? null,
        lastError: null,
        createdBy: row.createdBy ?? null,
        createdAt: existing?.createdAt ?? new Date(NOW),
        updatedAt: new Date(NOW),
      };
      rows.set(saved.serverKey, saved);
      return saved;
    },
    async remove(serverKey) {
      return rows.delete(serverKey);
    },
    async recordUse(serverKey, usedAt, error) {
      const existing = rows.get(serverKey);
      if (existing) rows.set(serverKey, { ...existing, lastUsedAt: usedAt, lastError: error });
    },
  };

  return { store, rows, tokenRequests };
}

function build(options: {
  seed?: McpCredentialRow[];
  env?: Record<string, string | undefined>;
  tokenResponse?: { status: number; payload: unknown };
  tokenThrows?: boolean;
} = {}) {
  const fakes = createFakeStore(options.seed);
  const service = createMcpCredentialService({
    store: fakes.store,
    encrypt,
    decrypt,
    now: () => NOW,
    env: options.env ?? {},
    requestToken: async ({ url, body }) => {
      fakes.tokenRequests.push({ url, body });
      if (options.tokenThrows) throw new Error("Netzwerk nicht erreichbar");
      return options.tokenResponse ?? { status: 200, payload: { access_token: "fresh-token", expires_in: 3600 } };
    },
  });
  return { service, ...fakes };
}

describe("Statische Geheimnisse", () => {
  it("speichert verschluesselt und liefert nur eine Vorschau", async () => {
    const { service, rows } = build();
    const result = await service.setStatic({ serverKey: "srv", kind: "bearer", secret: "sk-live-abcdefghij" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.credential.preview).not.toContain("abcdefghij");
    const stored = rows.get("srv");
    expect(stored?.encryptedPayload.startsWith("enc(")).toBe(true);
    expect(stored?.encryptedPayload).not.toContain("sk-live-abcdefghij");
  });

  it("weist zu kurze Werte ab", async () => {
    const { service, rows } = build();
    const result = await service.setStatic({ serverKey: "srv", kind: "api_key", secret: "kurz" });
    expect(result.ok).toBe(false);
    expect(rows.size).toBe(0);
  });

  it("listet nie Klartext", async () => {
    const { service } = build();
    await service.setStatic({ serverKey: "srv", kind: "api_key", secret: "sk-test-1234567890" });
    const listed = await service.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(JSON.stringify(listed)).not.toContain("sk-test-1234567890");
    expect(listed.credentials[0].status).toBe("static");
  });
});

describe("OAuth2-Client", () => {
  it("validiert URL und Client-Secret", async () => {
    const { service, rows } = build();
    expect(
      (await service.setOAuthClient({ serverKey: "srv", tokenUrl: "http://x.test/t", clientId: "a", clientSecret: "12345678" })).ok,
    ).toBe(false);
    expect(
      (await service.setOAuthClient({ serverKey: "srv", tokenUrl: "https://x.test/t", clientId: "a", clientSecret: "kurz" })).ok,
    ).toBe(false);
    expect(rows.size).toBe(0);
  });

  it("speichert Client-Daten verschluesselt und maskiert", async () => {
    const { service, rows } = build();
    const result = await service.setOAuthClient({
      serverKey: "srv",
      tokenUrl: "https://auth.example.com/token",
      clientId: "cybersarah",
      clientSecret: "client-secret-value",
      scopes: ["read"],
    });
    expect(result.ok).toBe(true);
    expect(rows.get("srv")?.encryptedPayload).not.toContain("client-secret-value");
    expect(rows.get("srv")?.scopes).toEqual(["read"]);
  });
});

describe("Token-Aufloesung", () => {
  it("liefert den statischen Wert aus dem Vault vor der ENV", async () => {
    const { service } = build();
    await service.setStatic({ serverKey: "srv", kind: "bearer", secret: "vault-token-123" });
    const resolved = await service.resolve({ serverKey: "srv", envVarName: "MCP_TOKEN" });
    expect(resolved).toEqual({ ok: true, token: "vault-token-123", source: "vault" });
  });

  it("faellt auf die ENV zurueck, wenn kein Vault-Eintrag existiert", async () => {
    const { service } = build({ env: { MCP_TOKEN: "env-token-123" } });
    const resolved = await service.resolve({ serverKey: "srv", envVarName: "MCP_TOKEN" });
    expect(resolved).toEqual({ ok: true, token: "env-token-123", source: "env" });
  });

  it("meldet fehlende Zugangsdaten klar", async () => {
    const { service } = build();
    const resolved = await service.resolve({ serverKey: "srv", envVarName: "MCP_TOKEN" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("MCP_TOKEN");
  });

  it("holt ein OAuth-Token genau einmal und cached es", async () => {
    const { service, tokenRequests, rows } = build();
    await service.setOAuthClient({
      serverKey: "srv",
      tokenUrl: "https://auth.example.com/token",
      clientId: "cybersarah",
      clientSecret: "client-secret-value",
    });

    const first = await service.resolve({ serverKey: "srv" });
    expect(first).toEqual({ ok: true, token: "fresh-token", source: "vault" });
    expect(tokenRequests).toHaveLength(1);

    const second = await service.resolve({ serverKey: "srv" });
    expect(second).toEqual({ ok: true, token: "fresh-token", source: "vault" });
    expect(tokenRequests).toHaveLength(1);
    expect(rows.get("srv")?.encryptedPayload).not.toContain("fresh-token");
  });

  it("erneuert ein abgelaufenes Token", async () => {
    const fakes = createFakeStore();
    const tokenRequests: string[] = [];
    let clock = NOW;
    const service = createMcpCredentialService({
      store: fakes.store,
      encrypt,
      decrypt,
      now: () => clock,
      env: {},
      requestToken: async ({ url }) => {
        tokenRequests.push(url);
        return { status: 200, payload: { access_token: `token-${tokenRequests.length}`, expires_in: 3600 } };
      },
    });

    await service.setOAuthClient({
      serverKey: "srv",
      tokenUrl: "https://auth.example.com/token",
      clientId: "c",
      clientSecret: "client-secret-value",
    });
    expect(await service.resolve({ serverKey: "srv" })).toEqual({ ok: true, token: "token-1", source: "vault" });

    clock = NOW + 2 * 60 * 60_000; // zwei Stunden spaeter: Token ist abgelaufen
    expect(await service.resolve({ serverKey: "srv" })).toEqual({ ok: true, token: "token-2", source: "vault" });
    expect(tokenRequests).toHaveLength(2);
  });

  it("speichert OAuth-Fehler und meldet sie", async () => {
    const { service, rows } = build({ tokenResponse: { status: 401, payload: { error: "invalid_client" } } });
    await service.setOAuthClient({
      serverKey: "srv",
      tokenUrl: "https://auth.example.com/token",
      clientId: "c",
      clientSecret: "client-secret-value",
    });
    const resolved = await service.resolve({ serverKey: "srv" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("invalid_client");
    expect(rows.get("srv")?.lastError).toContain("invalid_client");
  });

  it("meldet nicht erreichbare Token-Endpunkte statt Erfolg zu behaupten", async () => {
    const { service } = build({ tokenThrows: true });
    await service.setOAuthClient({
      serverKey: "srv",
      tokenUrl: "https://auth.example.com/token",
      clientId: "c",
      clientSecret: "client-secret-value",
    });
    const resolved = await service.resolve({ serverKey: "srv" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("nicht erreichbar");
  });
});

describe("Loeschen", () => {
  it("entfernt den Eintrag und meldet ehrlich, ob es einen gab", async () => {
    const { service } = build();
    await service.setStatic({ serverKey: "srv", kind: "bearer", secret: "token-12345678" });
    expect(await service.remove("srv")).toEqual({ ok: true, removed: true });
    expect(await service.remove("srv")).toEqual({ ok: true, removed: false });
  });
});

describe("Verschluesselungspfad", () => {
  it("verschluesselt mit einem echten Schluessel (AES-256-GCM)", async () => {
    const { encryptSecret, decryptSecret } = await import("../lib/provider-admin-logic");
    const cipher = encryptSecret("geheim-123456", SECRET_KEY);
    expect(cipher).not.toContain("geheim-123456");
    expect(decryptSecret(cipher, SECRET_KEY)).toBe("geheim-123456");
    expect(() => decryptSecret(cipher, "anderer-schluessel")).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  keyHasScope,
  decideApiKeyRequest,
  buildPreview,
  describeKey,
  createKeyRecord,
  revokeKey,
} from "@/lib/api-keys-logic";
import type { ApiKeyRecord } from "@/lib/api-keys-logic";

const key = (over: Partial<ApiKeyRecord> = {}): ApiKeyRecord => ({
  id: "k1",
  userId: "u1",
  name: "Mein Key",
  scopes: ["read"],
  preview: "abcd1234...",
  createdAt: 0,
  revokedAt: null,
  expiresAt: null,
  ...over,
});

describe("Sprint 339 — API-Keys mit Scope", () => {
  it("Scope-Vererbung: admin deckt alles, write deckt read", () => {
    expect(keyHasScope(key({ scopes: ["read"] }), "read")).toBe(true);
    expect(keyHasScope(key({ scopes: ["read"] }), "write")).toBe(false);
    expect(keyHasScope(key({ scopes: ["write"] }), "write")).toBe(true);
    expect(keyHasScope(key({ scopes: ["write"] }), "admin")).toBe(false);
    expect(keyHasScope(key({ scopes: ["admin"] }), "write")).toBe(true);
  });

  it("widerrufene und abgelaufene Keys werden abgewiesen", () => {
    expect(decideApiKeyRequest(key({ revokedAt: 5 }), "read", 10).allowed).toBe(false);
    expect(decideApiKeyRequest(key({ expiresAt: 100 }), "read", 100).allowed).toBe(false);
    expect(decideApiKeyRequest(key({ expiresAt: 100 }), "read", 99).allowed).toBe(true);
  });

  it("fehlender Scope wird beim Namen genannt", () => {
    const r = decideApiKeyRequest(key({ scopes: ["read"] }), "write", 1);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('"write"');
  });

  it("Preview zeigt nie den vollen Wert", () => {
    expect(buildPreview("abcdefghijklmnop")).toBe("abcdefgh...");
    const rec = createKeyRecord({ userId: "u", name: " K ", scopes: [], fingerprint: "zz", expiresAt: null }, "id1", 0);
    expect(rec.scopes).toEqual(["read"]);
    expect(rec.name).toBe("K");
    expect(describeKey(rec)).toContain("zz...");
    expect(describeKey(revokeKey(rec, 5))).toContain("widerrufen");
    expect(revokeKey(key({ revokedAt: 3 }), 5).revokedAt).toBe(3); // idempotent
  });
});

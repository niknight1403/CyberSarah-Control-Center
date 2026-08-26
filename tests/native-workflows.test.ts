import { describe, expect, it } from "vitest";
import { normalizeDocumentResult, normalizeMediaResult } from "../lib/media-picker-logic";
import { clearSessionTokens, loadSessionTokens, saveSessionTokens, type SecureSessionStore } from "../lib/secure-session-logic";
import { getPushStatusMessage } from "../lib/push-notifications-logic";
import { createAuditEvent, sanitizeAuditMetadata } from "../lib/external-action-audit-service";

function createMemoryStore(): SecureSessionStore {
  const values = new Map<string, string>();
  return {
    async set(key, value) { values.set(key, value); },
    async get(key) { return values.get(key) ?? null; },
    async remove(key) { values.delete(key); },
  };
}

describe("native workflow abstractions", () => {
  it("normalizes selected documents and ignores cancellation", () => {
    expect(normalizeDocumentResult({ canceled: true, assets: null })).toEqual([]);
    expect(normalizeDocumentResult({ canceled: false, assets: [{ uri: "file:///code.ts", name: "code.ts", mimeType: "text/typescript", size: 42, lastModified: 0 }] })).toEqual([{ id: "file:///code.ts-code.ts", name: "code.ts", uri: "file:///code.ts", kind: "datei", mimeType: "text/typescript", size: 42 }]);
  });

  it("normalizes photos and videos with stable fallback names", () => {
    const result = normalizeMediaResult("foto", { canceled: false, assets: [{ uri: "ph://1", assetId: "asset-1", width: 10, height: 10, fileName: null, fileSize: null, mimeType: "image/jpeg", type: "image", exif: null, base64: null, duration: null, creationTime: 0, modificationTime: 0, mediaType: "photo" }] } as never);
    expect(result[0]).toMatchObject({ id: "asset-1-foto", name: "Foto", kind: "foto", uri: "ph://1", mimeType: "image/jpeg" });
    expect(normalizeMediaResult("video", { canceled: true, assets: null } as never)).toEqual([]);
  });

  it("stores, reloads, and clears session tokens without exposing values", async () => {
    const store = createMemoryStore();
    await saveSessionTokens({ accessToken: "access-secret", refreshToken: "refresh-secret", sessionId: "session-1", biometricProtection: true }, store);
    expect(await loadSessionTokens(store)).toEqual({ accessToken: "access-secret", refreshToken: "refresh-secret", sessionId: "session-1" });
    await clearSessionTokens(store);
    expect(await loadSessionTokens(store)).toEqual({ accessToken: null, refreshToken: null, sessionId: null });
  });

  it("maps push registration outcomes to safe German status messages", () => {
    expect(getPushStatusMessage({ supported: false, permission: "denied", token: null, reason: "web" })).toContain("Web");
    expect(getPushStatusMessage({ supported: true, permission: "granted", token: null, reason: "project-id-missing" })).toContain("Projekt-ID");
    expect(getPushStatusMessage({ supported: true, permission: "granted", token: "ExponentPushToken[test]" })).toContain("aktiviert");
  });

  it("redacts audit credentials and creates stable release events", () => {
    expect(sanitizeAuditMetadata({ githubToken: "secret", branch: "next-development", nested: { ignored: true } })).toEqual({ githubToken: "[REDACTED]", branch: "next-development", nested: "[object Object]" });
    expect(createAuditEvent({ eventId: "evt-1", action: "ci", status: "passed", occurredAt: "2026-08-26T10:00:00.000Z", metadata: { authorization: "secret" } })).toMatchObject({ eventId: "evt-1", status: "passed", occurredAt: "2026-08-26T10:00:00.000Z", metadata: { authorization: "[REDACTED]" } });
  });
});

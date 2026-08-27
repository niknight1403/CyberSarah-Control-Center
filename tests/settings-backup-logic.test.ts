import { describe, expect, it } from "vitest";
import { createEncryptedSettingsBackup, decryptEncryptedSettingsBackup, getEncryptedSettingsBackupPreview, getSettingsBackupRestoreConfirmation, getSettingsBackupShareConfirmation, isValidSettingsBackupPassword, verifyEncryptedSettingsBackup } from "../lib/settings-backup-logic";

const input = {
  providerKeys: { openai: "sk-test-secret", gemini: "AIza-test-secret" },
  localProviderEndpoints: { ollama: "http://192.168.1.20:11434/v1", lmstudio: "http://192.168.1.20:1234/v1" },
  passphrase: "correct horse battery staple",
  salt: new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1)),
  iv: new Uint8Array(Array.from({ length: 16 }, (_, index) => index + 33)),
  createdAt: "2026-08-26T18:00:00.000Z",
};

describe("settings backup logic", () => {
  it("requires a long export password", () => {
    expect(isValidSettingsBackupPassword("short")).toBe(false);
    expect(isValidSettingsBackupPassword(input.passphrase)).toBe(true);
  });

  it("does not expose provider keys or endpoint URLs in the encrypted envelope", () => {
    const backup = createEncryptedSettingsBackup(input);
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).not.toContain("AIza-test-secret");
    expect(serialized).not.toContain("192.168.1.20");
    expect(verifyEncryptedSettingsBackup(backup, input.passphrase)).toEqual({ valid: true });
  });

  it("returns only bounded metadata after authenticated verification", () => {
    const backup = createEncryptedSettingsBackup(input);
    expect(getEncryptedSettingsBackupPreview(backup, input.passphrase)).toEqual({ createdAt: input.createdAt, providerIds: ["openai", "gemini"], endpointCount: 2 });
    expect(verifyEncryptedSettingsBackup(backup, "wrong password").valid).toBe(false);
  });

  it("decrypts only after authentication and returns restorable values", () => {
    const backup = createEncryptedSettingsBackup(input);
    expect(decryptEncryptedSettingsBackup(backup, input.passphrase)).toMatchObject({
      providerKeys: input.providerKeys,
      localProviderEndpoints: input.localProviderEndpoints,
      preview: { providerIds: ["openai", "gemini"], endpointCount: 2 },
    });
    expect(() => decryptEncryptedSettingsBackup(backup, "wrong password")).toThrow("nicht sicher verifiziert");
    expect(getSettingsBackupRestoreConfirmation({ createdAt: input.createdAt, providerIds: ["openai"], endpointCount: 2 }).message).toContain("Service- und GitHub-Tokens bleiben unverändert");
  });

  it("rejects oversized provider keys and endpoint URLs before encryption", () => {
    expect(() => createEncryptedSettingsBackup({ ...input, providerKeys: { openai: "x".repeat(513) } })).toThrow("Provider-Key");
    expect(() => createEncryptedSettingsBackup({ ...input, localProviderEndpoints: { ollama: `http://${"a".repeat(2050)}`, lmstudio: "" } })).toThrow("Endpoint-URL");
  });

  it("rejects an excessive number of providers before encryption", () => {
    const providerKeys = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`provider-${index}`, `key-${index}`]));
    expect(() => createEncryptedSettingsBackup({ ...input, providerKeys })).toThrow("zu viele Provider");
  });

  it("detects tampering and warns not to share the password with the file", () => {
    const backup = createEncryptedSettingsBackup(input);
    const tampered = { ...backup, cipher: { ...backup.cipher, ciphertext: `${backup.cipher.ciphertext}x` } };
    expect(verifyEncryptedSettingsBackup(tampered, input.passphrase).valid).toBe(false);
    const confirmation = getSettingsBackupShareConfirmation();
    expect(confirmation.message).toContain("Passwort niemals zusammen");
  });
});

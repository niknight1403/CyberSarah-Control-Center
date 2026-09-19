import { describe, expect, it } from "vitest";
import { createEncryptedSupportBackup, getEncryptedSupportBackupPreview, getSupportShareConfirmation, isValidSupportBackupPassword, SUPPORT_BACKUP_FORMAT, SUPPORT_BACKUP_ITERATIONS, verifyEncryptedSupportBackup } from "../lib/support-backup-logic";
import { serializeDevelopmentChatHistory } from "../lib/development-chat-history-logic";
// Produktion bleibt bei 310.000 Iterationen (SUPPORT_BACKUP_ITERATIONS).
// Unter Vitest (NODE_ENV=test) senkt vitest.config.ts die effektive Zahl auf
// 10.000 ab (SUPPORT_BACKUP_TEST_KDF_ITERATIONS, Guard >= 1.000) — die
// Envelope-Assertion prueft darum die effektive Zahl statt der Konstante.

describe("encrypted support backups", () => {
  const history = serializeDevelopmentChatHistory([{ id: "one", role: "user", content: "Please investigate this deployment issue." }]);

  it(
    "creates an authenticated encrypted envelope without exposing conversation plaintext",
    () => {
    const backup = createEncryptedSupportBackup({ history, passphrase: "a carefully chosen password", salt: new Uint8Array(32).fill(7), iv: new Uint8Array(16).fill(9), createdAt: "2026-08-21T07:00:00.000Z" });
    const serialized = JSON.stringify(backup);
    expect(backup.format).toBe(SUPPORT_BACKUP_FORMAT);
    expect(backup.cipher.mac).toBeTruthy();
    expect(serialized).not.toContain("deployment issue");
    expect(SUPPORT_BACKUP_ITERATIONS).toBe(310_000);
    const override = Number.parseInt(process.env.SUPPORT_BACKUP_TEST_KDF_ITERATIONS ?? "", 10);
    const expected = process.env.NODE_ENV === "test" && Number.isFinite(override) && override >= 1_000 ? override : SUPPORT_BACKUP_ITERATIONS;
    expect(backup.kdf.iterations).toBe(expected);
  }, 180_000);

  it("requires a sufficiently long export password", () => {
    expect(isValidSupportBackupPassword("short")).toBe(false);
    expect(isValidSupportBackupPassword("long-enough-password")).toBe(true);
  });

  it(
    "verifies an authenticated envelope before a bounded restore preview and rejects tampering",
    () => {
    const backup = createEncryptedSupportBackup({ history, passphrase: "a carefully chosen password", salt: new Uint8Array(32).fill(4), iv: new Uint8Array(16).fill(8), createdAt: "2026-08-21T07:00:00.000Z" });
    expect(verifyEncryptedSupportBackup(backup, "a carefully chosen password")).toEqual({ valid: true });
    expect(getEncryptedSupportBackupPreview(backup, "a carefully chosen password")).toMatchObject({ messageCount: 1, excerpts: ["Please investigate this deployment issue."] });
    expect(verifyEncryptedSupportBackup({ ...backup, cipher: { ...backup.cipher, ciphertext: `${backup.cipher.ciphertext}x` } }, "a carefully chosen password").valid).toBe(false);
  }, 180_000);

  it("explains the encrypted support-sharing scope before the system share action", () => {
    const confirmation = getSupportShareConfirmation();
    expect(confirmation.title).toContain("Support");
    expect(confirmation.message).toContain("keine Tokens");
    expect(confirmation.message).toContain("Passwort wird nicht mitgesendet");
  });
});

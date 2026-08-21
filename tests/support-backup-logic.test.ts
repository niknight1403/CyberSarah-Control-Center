import { describe, expect, it } from "vitest";
import { createEncryptedSupportBackup, isValidSupportBackupPassword, SUPPORT_BACKUP_FORMAT } from "../lib/support-backup-logic";
import { serializeDevelopmentChatHistory } from "../lib/development-chat-history-logic";

describe("encrypted support backups", () => {
  const history = serializeDevelopmentChatHistory([{ id: "one", role: "user", content: "Please investigate this deployment issue." }]);

  it("creates an authenticated encrypted envelope without exposing conversation plaintext", () => {
    const backup = createEncryptedSupportBackup({ history, passphrase: "a carefully chosen password", salt: new Uint8Array(32).fill(7), iv: new Uint8Array(16).fill(9), createdAt: "2026-08-21T07:00:00.000Z" });
    const serialized = JSON.stringify(backup);
    expect(backup.format).toBe(SUPPORT_BACKUP_FORMAT);
    expect(backup.cipher.mac).toBeTruthy();
    expect(serialized).not.toContain("deployment issue");
    expect(backup.kdf.iterations).toBeGreaterThan(100_000);
  });

  it("requires a sufficiently long export password", () => {
    expect(isValidSupportBackupPassword("short")).toBe(false);
    expect(isValidSupportBackupPassword("long-enough-password")).toBe(true);
  });
});

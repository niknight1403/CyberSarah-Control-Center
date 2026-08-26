import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { createEncryptedSettingsBackup, getEncryptedSettingsBackupPreview, isValidSettingsBackupPassword, verifyEncryptedSettingsBackup, type SettingsBackupPreview, type SettingsBackupVerification } from "./settings-backup-logic";
import type { LocalProviderEndpoints } from "./studio-settings-logic";

export { getSettingsBackupShareConfirmation, isValidSettingsBackupPassword } from "./settings-backup-logic";

export type SettingsBackupExportResult = {
  filename: string;
  fileUri: string;
  verification: SettingsBackupVerification;
  preview: SettingsBackupPreview;
};

export async function exportEncryptedSettingsBackup(input: { providerKeys: Record<string, string>; localProviderEndpoints: LocalProviderEndpoints; passphrase: string }): Promise<SettingsBackupExportResult> {
  if (Platform.OS === "web") throw new Error("Verschlüsselte Settings-Backups sind nur in der nativen App verfügbar.");
  if (!isValidSettingsBackupPassword(input.passphrase)) throw new Error("Das Backup-Passwort muss mindestens 12 Zeichen enthalten.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Das System-Menü zum Teilen ist auf diesem Gerät nicht verfügbar.");
  const [salt, iv] = await Promise.all([Crypto.getRandomBytesAsync(32), Crypto.getRandomBytesAsync(16)]);
  const backup = createEncryptedSettingsBackup({ ...input, passphrase: input.passphrase.trim(), salt, iv, createdAt: new Date().toISOString() });
  const verification = verifyEncryptedSettingsBackup(backup, input.passphrase);
  if (!verification.valid) throw new Error(verification.reason ?? "Das erzeugte Settings-Backup konnte nicht verifiziert werden.");
  const preview = getEncryptedSettingsBackupPreview(backup, input.passphrase);
  const filename = `cybersarah-provider-settings-${Date.now()}.csc-backup`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup), { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(fileUri, { dialogTitle: "Verschlüsseltes Provider-Backup teilen", mimeType: "application/vnd.cybersarah.settings-backup+json", UTI: "public.data" });
  return { filename, fileUri, verification, preview };
}

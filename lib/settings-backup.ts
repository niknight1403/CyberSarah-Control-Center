import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { createEncryptedSettingsBackup, decryptEncryptedSettingsBackup, getEncryptedSettingsBackupPreview, isSupportedEncryptedSettingsBackup, isValidSettingsBackupPassword, verifyEncryptedSettingsBackup, type EncryptedSettingsBackup, type RestoredSettingsBackup, type SettingsBackupPreview, type SettingsBackupVerification } from "./settings-backup-logic";
import type { LocalProviderEndpoints } from "./studio-settings-logic";

export { getSettingsBackupRestoreConfirmation, getSettingsBackupShareConfirmation, isValidSettingsBackupPassword } from "./settings-backup-logic";
export type { SettingsBackupPreview } from "./settings-backup-logic";

export type SettingsBackupExportResult = {
  filename: string;
  fileUri: string;
  verification: SettingsBackupVerification;
  preview: SettingsBackupPreview;
};

export type SettingsBackupImportCandidate = {
  backup: EncryptedSettingsBackup;
  filename: string;
  size?: number;
};

export type SettingsBackupRestoreResult = RestoredSettingsBackup["preview"] & { filename: string };

const MAX_SETTINGS_BACKUP_BYTES = 512 * 1024;

export async function pickEncryptedSettingsBackup(): Promise<SettingsBackupImportCandidate | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/vnd.cybersarah.settings-backup+json", "application/json", "*/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_SETTINGS_BACKUP_BYTES) throw new Error("Die Backup-Datei ist zu groß. Erwartet wird eine verschlüsselte Settings-Datei unter 512 KB.");
  let parsed: unknown;
  try {
    const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Die ausgewählte Datei ist kein lesbares verschlüsseltes Settings-Backup.");
  }
  if (!isSupportedEncryptedSettingsBackup(parsed)) throw new Error("Das Settings-Backup-Format ist ungültig oder wird nicht unterstützt.");
  return { backup: parsed, filename: asset.name, size: asset.size };
}

export function previewEncryptedSettingsBackup(backup: unknown, passphrase: string) {
  return getEncryptedSettingsBackupPreview(backup, passphrase);
}

export function restoreEncryptedSettingsBackup(backup: unknown, passphrase: string) {
  return decryptEncryptedSettingsBackup(backup, passphrase);
}

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

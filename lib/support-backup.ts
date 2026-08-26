import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { createEncryptedSupportBackup, getEncryptedSupportBackupPreview, isValidSupportBackupPassword, verifyEncryptedSupportBackup } from "./support-backup-logic";

export { isValidSupportBackupPassword } from "./support-backup-logic";

export async function exportEncryptedSupportBackup(history: string, passphrase: string) {
  if (Platform.OS === "web") throw new Error("Verschlüsselte Datei-Backups sind nur in der nativen App verfügbar.");
  if (!isValidSupportBackupPassword(passphrase)) throw new Error("Das Export-Passwort muss mindestens 12 Zeichen enthalten.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Das System-Menü zum Teilen ist auf diesem Gerät nicht verfügbar.");
  const [salt, iv] = await Promise.all([Crypto.getRandomBytesAsync(32), Crypto.getRandomBytesAsync(16)]);
  const backup = createEncryptedSupportBackup({ history, passphrase, salt, iv, createdAt: new Date().toISOString() });
  const verification = verifyEncryptedSupportBackup(backup, passphrase);
  if (!verification.valid) throw new Error(verification.reason ?? "Das erzeugte Backup konnte nicht verifiziert werden.");
  const preview = getEncryptedSupportBackupPreview(backup, passphrase);
  const filename = `custom-ai-studio-support-${Date.now()}.cai-backup`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup), { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(fileUri, { dialogTitle: "Verschlüsseltes Support-Backup teilen", mimeType: "application/vnd.custom-ai-studio.backup+json", UTI: "public.data" });
  return { filename, fileUri, verification, preview };
}

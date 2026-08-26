import CryptoJS from "crypto-js";
import type { LocalProviderEndpoints } from "./studio-settings-logic";

export const SETTINGS_BACKUP_FORMAT = "cybersarah-control-center.encrypted-settings-backup";
export const SETTINGS_BACKUP_VERSION = 1;
export const SETTINGS_BACKUP_ITERATIONS = 310_000;

type SettingsBackupPayload = {
  scope: "provider-settings";
  createdAt: string;
  providerKeys: Record<string, string>;
  localProviderEndpoints: LocalProviderEndpoints;
  excluded: string[];
};

export type EncryptedSettingsBackup = {
  format: typeof SETTINGS_BACKUP_FORMAT;
  version: typeof SETTINGS_BACKUP_VERSION;
  createdAt: string;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { name: "AES-256-CBC+HMAC-SHA256"; iv: string; ciphertext: string; mac: string };
};

export type SettingsBackupPreview = {
  createdAt: string;
  providerIds: string[];
  endpointCount: number;
};

export type SettingsBackupVerification = { valid: boolean; reason?: string };

function bytesToWordArray(bytes: Uint8Array) {
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] = (words[index >>> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBase64(value: CryptoJS.lib.WordArray) {
  return CryptoJS.enc.Base64.stringify(value);
}

function deriveKeys(passphrase: string, salt: CryptoJS.lib.WordArray) {
  const material = CryptoJS.PBKDF2(passphrase, salt, { keySize: 16, iterations: SETTINGS_BACKUP_ITERATIONS, hasher: CryptoJS.algo.SHA256 });
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32),
  };
}

function createMacPayload(backup: Omit<EncryptedSettingsBackup, "cipher"> & { cipher: Omit<EncryptedSettingsBackup["cipher"], "mac"> }) {
  return [backup.format, backup.version, backup.createdAt, backup.kdf.name, backup.kdf.iterations, backup.kdf.salt, backup.cipher.name, backup.cipher.iv, backup.cipher.ciphertext].join("|");
}

function isEncryptedSettingsBackup(value: unknown): value is EncryptedSettingsBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedSettingsBackup>;
  return candidate.format === SETTINGS_BACKUP_FORMAT && candidate.version === SETTINGS_BACKUP_VERSION && typeof candidate.createdAt === "string" && candidate.kdf?.name === "PBKDF2-SHA256" && typeof candidate.kdf.iterations === "number" && typeof candidate.kdf.salt === "string" && candidate.cipher?.name === "AES-256-CBC+HMAC-SHA256" && typeof candidate.cipher.iv === "string" && typeof candidate.cipher.ciphertext === "string" && typeof candidate.cipher.mac === "string";
}

function getVerifiedBackup(backup: unknown, passphrase: string) {
  if (!isEncryptedSettingsBackup(backup) || !isValidSettingsBackupPassword(passphrase)) return null;
  try {
    const salt = CryptoJS.enc.Base64.parse(backup.kdf.salt);
    const { macKey } = deriveKeys(passphrase, salt);
    const unsignedBackup = { format: backup.format, version: backup.version, createdAt: backup.createdAt, kdf: backup.kdf, cipher: { name: backup.cipher.name, iv: backup.cipher.iv, ciphertext: backup.cipher.ciphertext } };
    const expectedMac = CryptoJS.HmacSHA256(createMacPayload(unsignedBackup), macKey).toString(CryptoJS.enc.Base64);
    return expectedMac === backup.cipher.mac ? backup : null;
  } catch {
    return null;
  }
}

export function isValidSettingsBackupPassword(value: string) {
  return value.trim().length >= 12;
}

export function getSettingsBackupShareConfirmation() {
  return {
    title: "Verschlüsseltes Provider-Backup teilen?",
    message: "Die Datei enthält Cloud-API-Keys und lokale Provider-URLs. Sie ist mit deinem Passwort verschlüsselt. Teile sie nur über einen vertrauenswürdigen Kanal und sende das Passwort niemals zusammen mit der Datei.",
  };
}

export function createEncryptedSettingsBackup(input: { providerKeys: Record<string, string>; localProviderEndpoints: LocalProviderEndpoints; passphrase: string; salt: Uint8Array; iv: Uint8Array; createdAt: string }): EncryptedSettingsBackup {
  if (!isValidSettingsBackupPassword(input.passphrase)) throw new Error("Das Backup-Passwort muss mindestens 12 Zeichen enthalten.");
  if (input.salt.length < 16 || input.iv.length !== 16) throw new Error("Die Verschlüsselungsparameter sind ungültig.");
  const providerKeys = Object.fromEntries(Object.entries(input.providerKeys).filter(([provider, key]) => provider.trim().length > 0 && key.trim().length > 0).map(([provider, key]) => [provider, key.trim()]));
  const payload: SettingsBackupPayload = { scope: "provider-settings", createdAt: input.createdAt, providerKeys, localProviderEndpoints: input.localProviderEndpoints, excluded: ["serviceAccessToken", "githubToken", "chatHistory", "fullGeneratedFileContents"] };
  const plainPayload = JSON.stringify(payload);
  const salt = bytesToWordArray(input.salt);
  const iv = bytesToWordArray(input.iv);
  const { encryptionKey, macKey } = deriveKeys(input.passphrase, salt);
  const ciphertext = CryptoJS.AES.encrypt(plainPayload, encryptionKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext;
  const unsignedBackup: Omit<EncryptedSettingsBackup, "cipher"> & { cipher: Omit<EncryptedSettingsBackup["cipher"], "mac"> } = {
    format: SETTINGS_BACKUP_FORMAT,
    version: SETTINGS_BACKUP_VERSION,
    createdAt: input.createdAt,
    kdf: { name: "PBKDF2-SHA256", iterations: SETTINGS_BACKUP_ITERATIONS, salt: wordArrayToBase64(salt) },
    cipher: { name: "AES-256-CBC+HMAC-SHA256", iv: wordArrayToBase64(iv), ciphertext: wordArrayToBase64(ciphertext) },
  };
  const mac = CryptoJS.HmacSHA256(createMacPayload(unsignedBackup), macKey).toString(CryptoJS.enc.Base64);
  return { ...unsignedBackup, cipher: { ...unsignedBackup.cipher, mac } };
}

export function verifyEncryptedSettingsBackup(backup: unknown, passphrase: string): SettingsBackupVerification {
  if (!isEncryptedSettingsBackup(backup)) return { valid: false, reason: "Das Settings-Backup-Format ist ungültig oder wird nicht unterstützt." };
  if (!isValidSettingsBackupPassword(passphrase)) return { valid: false, reason: "Das Backup-Passwort ist ungültig." };
  return getVerifiedBackup(backup, passphrase) ? { valid: true } : { valid: false, reason: "Integritätsprüfung fehlgeschlagen. Datei oder Passwort stimmen nicht überein." };
}

export function getEncryptedSettingsBackupPreview(backup: unknown, passphrase: string): SettingsBackupPreview {
  const verifiedBackup = getVerifiedBackup(backup, passphrase);
  if (!verifiedBackup) throw new Error("Das Settings-Backup konnte nicht sicher verifiziert werden.");
  try {
    const salt = CryptoJS.enc.Base64.parse(verifiedBackup.kdf.salt);
    const iv = CryptoJS.enc.Base64.parse(verifiedBackup.cipher.iv);
    const ciphertext = CryptoJS.enc.Base64.parse(verifiedBackup.cipher.ciphertext);
    const { encryptionKey } = deriveKeys(passphrase, salt);
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
    const plaintext = CryptoJS.AES.decrypt(cipherParams, encryptionKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
    const payload = JSON.parse(plaintext) as Partial<SettingsBackupPayload>;
    return { createdAt: typeof payload.createdAt === "string" ? payload.createdAt : verifiedBackup.createdAt, providerIds: payload.providerKeys && typeof payload.providerKeys === "object" ? Object.keys(payload.providerKeys) : [], endpointCount: payload.localProviderEndpoints && typeof payload.localProviderEndpoints === "object" ? Object.values(payload.localProviderEndpoints).filter((endpoint) => typeof endpoint === "string" && endpoint.length > 0).length : 0 };
  } catch {
    throw new Error("Das verifizierte Settings-Backup enthält keine lesbare Vorschau.");
  }
}

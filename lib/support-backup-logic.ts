import CryptoJS from "crypto-js";
import { parseDevelopmentChatHistory } from "./development-chat-history-logic";

export const SUPPORT_BACKUP_FORMAT = "custom-ai-studio.encrypted-chat-backup";
export const SUPPORT_BACKUP_VERSION = 1;
export const SUPPORT_BACKUP_ITERATIONS = 310_000;

export type EncryptedSupportBackup = {
  format: typeof SUPPORT_BACKUP_FORMAT;
  version: typeof SUPPORT_BACKUP_VERSION;
  createdAt: string;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { name: "AES-256-CBC+HMAC-SHA256"; iv: string; ciphertext: string; mac: string };
};

function bytesToWordArray(bytes: Uint8Array) {
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) words[index >>> 2] = (words[index >>> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8));
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBase64(value: CryptoJS.lib.WordArray) {
  return CryptoJS.enc.Base64.stringify(value);
}

function deriveKeys(passphrase: string, salt: CryptoJS.lib.WordArray) {
  const material = CryptoJS.PBKDF2(passphrase, salt, { keySize: 16, iterations: SUPPORT_BACKUP_ITERATIONS, hasher: CryptoJS.algo.SHA256 });
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32),
  };
}

function createMacPayload(backup: Omit<EncryptedSupportBackup, "cipher"> & { cipher: Omit<EncryptedSupportBackup["cipher"], "mac"> }) {
  return [backup.format, backup.version, backup.createdAt, backup.kdf.name, backup.kdf.iterations, backup.kdf.salt, backup.cipher.name, backup.cipher.iv, backup.cipher.ciphertext].join("|");
}

export function isValidSupportBackupPassword(value: string) {
  return value.trim().length >= 12;
}

export function getSupportShareConfirmation() {
  return {
    title: "Verschlüsseltes Backup für Support freigeben?",
    message: "Die Datei enthält den begrenzten Chat-Verlauf, ist mit deinem Passwort geschützt und enthält keine Tokens, API-Schlüssel oder vollständigen generierten Datei-Inhalte. Teile sie nur mit einem vertrauenswürdigen Support-Kanal. Das Passwort wird nicht mitgesendet.",
  };
}

export function createEncryptedSupportBackup(input: { history: string; passphrase: string; salt: Uint8Array; iv: Uint8Array; createdAt: string }): EncryptedSupportBackup {
  if (!isValidSupportBackupPassword(input.passphrase)) throw new Error("Das Export-Passwort muss mindestens 12 Zeichen enthalten.");
  if (input.salt.length < 16 || input.iv.length !== 16) throw new Error("Die Verschlüsselungsparameter sind ungültig.");
  const messages = parseDevelopmentChatHistory(input.history);
  const plainPayload = JSON.stringify({ scope: "development-chat-history", createdAt: input.createdAt, messages, excluded: ["tokens", "apiKeys", "fullGeneratedFileContents"] });
  const salt = bytesToWordArray(input.salt);
  const iv = bytesToWordArray(input.iv);
  const { encryptionKey, macKey } = deriveKeys(input.passphrase, salt);
  const ciphertext = CryptoJS.AES.encrypt(plainPayload, encryptionKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext;
  const unsignedBackup: Omit<EncryptedSupportBackup, "cipher"> & { cipher: Omit<EncryptedSupportBackup["cipher"], "mac"> } = {
    format: SUPPORT_BACKUP_FORMAT,
    version: SUPPORT_BACKUP_VERSION,
    createdAt: input.createdAt,
    kdf: { name: "PBKDF2-SHA256" as const, iterations: SUPPORT_BACKUP_ITERATIONS, salt: wordArrayToBase64(salt) },
    cipher: { name: "AES-256-CBC+HMAC-SHA256" as const, iv: wordArrayToBase64(iv), ciphertext: wordArrayToBase64(ciphertext) },
  };
  return { ...unsignedBackup, cipher: { ...unsignedBackup.cipher, mac: CryptoJS.HmacSHA256(createMacPayload(unsignedBackup), macKey).toString(CryptoJS.enc.Base64) } };
}

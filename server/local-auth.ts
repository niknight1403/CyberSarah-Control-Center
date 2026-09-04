import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const deriveKey = (password: string, salt: Buffer, keyLength: number) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, keyLength, SCRYPT_PARAMETERS, (error, derived) => error ? reject(error) : resolve(derived));
});
const KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateAccountPassword(password: string) {
  if (password.length < 12) return "Das Passwort muss mindestens 12 Zeichen lang sein.";
  if (password.length > 256) return "Das Passwort darf höchstens 256 Zeichen lang sein.";
  return undefined;
}

export async function hashPassword(password: string) {
  const invalidReason = validateAccountPassword(password);
  if (invalidReason) throw new Error(invalidReason);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, encodedSalt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedHash) return false;
  try {
    const expected = Buffer.from(encodedHash, "base64url");
    const actual = await deriveKey(password, Buffer.from(encodedSalt, "base64url"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

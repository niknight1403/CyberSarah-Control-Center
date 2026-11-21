import { timingSafeEqual } from "node:crypto";

/** Compare server-to-server upload credentials without leaking prefix matches. */
export function isValidStorageUploadKey(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  if (expectedBytes.length !== suppliedBytes.length) return false;
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

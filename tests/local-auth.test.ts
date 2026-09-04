import { describe, expect, it } from "vitest";
import { hashPassword, normalizeAccountEmail, validateAccountPassword, verifyPassword } from "../server/local-auth";

describe("local account authentication", () => {
  it("normalizes account emails consistently", () => {
    expect(normalizeAccountEmail("  Niko.Oeben@Gmail.com ")).toBe("niko.oeben@gmail.com");
  });

  it("requires a sufficiently strong password", () => {
    expect(validateAccountPassword("short")).toContain("mindestens 12");
    expect(validateAccountPassword("a secure local password")).toBeUndefined();
  });

  it("verifies only the original password against an encoded scrypt hash", async () => {
    const hash = await hashPassword("a secure local password");
    await expect(verifyPassword("a secure local password", hash)).resolves.toBe(true);
    await expect(verifyPassword("different password", hash)).resolves.toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isValidStorageUploadKey } from "../modules/revenue-os/artifacts/api-server/src/lib/storageUploadAuth";

describe("storage upload authentication", () => {
  it("accepts only an exact configured server key", () => {
    expect(isValidStorageUploadKey("secret-key", "secret-key")).toBe(true);
  });

  it("rejects missing, empty, wrong and prefix-only credentials", () => {
    expect(isValidStorageUploadKey("", "secret-key")).toBe(false);
    expect(isValidStorageUploadKey("secret-key", "")).toBe(false);
    expect(isValidStorageUploadKey("secret-key", "secret")).toBe(false);
    expect(isValidStorageUploadKey("secret-key", "other-key")).toBe(false);
  });
});

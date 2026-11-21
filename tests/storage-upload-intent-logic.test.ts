import { describe, expect, it } from "vitest";
import { matchesDeclaredUploadMetadata } from "../modules/revenue-os/artifacts/api-server/src/lib/storageUploadIntentLogic";

describe("durable storage upload intent metadata", () => {
  it("accepts an exact declared content type and byte size", () => {
    expect(matchesDeclaredUploadMetadata(
      { contentType: "image/webp", size: 1024 },
      { contentType: "image/webp", size: 1024 },
    )).toBe(true);
  });

  it("rejects content-type and size mismatches", () => {
    expect(matchesDeclaredUploadMetadata(
      { contentType: "image/png", size: 1024 },
      { contentType: "image/webp", size: 1024 },
    )).toBe(false);
    expect(matchesDeclaredUploadMetadata(
      { contentType: "image/png", size: 1024 },
      { contentType: "image/png", size: 1025 },
    )).toBe(false);
  });

  it("rejects invalid or unsafe byte counts", () => {
    for (const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(matchesDeclaredUploadMetadata(
        { contentType: "image/png", size },
        { contentType: "image/png", size },
      )).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { validateSignedStorageUrl, validateStorageObjectKey } from "../lib/storage-proxy-logic";

describe("storage proxy validation", () => {
  it("accepts generated-style relative object keys", () => {
    expect(validateStorageObjectKey("assets/reel_1234.mp4")).toBe(true);
    expect(validateStorageObjectKey("custom-ai-studio-icon_4c79bf2f.png")).toBe(true);
  });

  it("rejects traversal, absolute paths and encoded separators", () => {
    for (const key of ["../secret", "a/../secret", "/bucket/object", "a%2f..%2fsecret", "a\\b", "a//b", "a?x=1"]) {
      expect(validateStorageObjectKey(key), key).toBe(false);
    }
  });

  it("accepts HTTPS signed URLs from supported object-storage providers", () => {
    expect(validateSignedStorageUrl("https://storage.googleapis.com/bucket/object?X-Goog-Signature=abc")).toBe(true);
    expect(validateSignedStorageUrl("https://storage.googleapis.com/bucket/object?X-Goog-Signature=abc")).toBe(true);
  });

  it("rejects insecure, credentialed, local and untrusted redirect targets", () => {
    for (const url of [
      "http://storage.googleapis.com/object",
      "https://user:pass@storage.googleapis.com/object",
      "https://localhost/object",
      "https://127.0.0.1/object",
      "https://attacker.example/object",
      "https://storage.googleapis.com.attacker.example/object",
      "https://storage.googleapis.com/object#fragment",
      "https://storage.googleapis.com:8443/object?sig=abc",
      "https://bucket.s3.eu-central-1.amazonaws.com/object?X-Amz-Signature=abc",
      "https://account.r2.cloudflarestorage.com/object?sig=abc",
      "https://evil.storage.googleapis.com/object?sig=abc",
    ]) {
      expect(validateSignedStorageUrl(url), url).toBe(false);
    }
  });
});

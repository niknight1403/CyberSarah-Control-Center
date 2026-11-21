import { describe, expect, it } from "vitest";
import { matchesDeclaredUploadMetadata, resolveUploadTenantId } from "../modules/revenue-os/artifacts/api-server/src/lib/storageUploadIntentLogic";

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

describe("storage upload tenant membership", () => {
  it("uses the only membership when no tenant is requested", () => {
    expect(resolveUploadTenantId([17], undefined)).toEqual({ ok: true, tenantId: 17 });
  });

  it("allows an explicitly selected tenant only when membership exists", () => {
    expect(resolveUploadTenantId([17, 23], "23")).toEqual({ ok: true, tenantId: 23 });
    expect(resolveUploadTenantId([17, 23], "99")).toEqual({ ok: false, reason: "forbidden" });
  });

  it("requires an explicit selection for multiple memberships", () => {
    expect(resolveUploadTenantId([17, 23], undefined)).toEqual({ ok: false, reason: "selection_required" });
  });

  it("keeps users without tenant memberships user-owned and rejects invalid tenant IDs", () => {
    expect(resolveUploadTenantId([], undefined)).toEqual({ ok: true, tenantId: null });
    expect(resolveUploadTenantId([17], "0")).toEqual({ ok: false, reason: "invalid" });
    expect(resolveUploadTenantId([17], "1.5")).toEqual({ ok: false, reason: "invalid" });
  });
});

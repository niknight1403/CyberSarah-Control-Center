import { describe, expect, it } from "vitest";
import { isTrpcRequestPath } from "../lib/rate-limit-routing-logic";

describe("isTrpcRequestPath", () => {
  it("recognizes tRPC API paths", () => {
    expect(isTrpcRequestPath("/api/trpc/account.me")).toBe(true);
    expect(isTrpcRequestPath("/api/trpc/orchestrator.run")).toBe(true);
  });

  it("rejects non-tRPC paths", () => {
    expect(isTrpcRequestPath("/api/health")).toBe(false);
    expect(isTrpcRequestPath("/api/render/webhook")).toBe(false);
    expect(isTrpcRequestPath("/")).toBe(false);
  });

  it("handles missing path safely", () => {
    expect(isTrpcRequestPath(undefined)).toBe(false);
    expect(isTrpcRequestPath(null)).toBe(false);
    expect(isTrpcRequestPath("")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { makeGrowthExecutionGuard } from "../lib/growth-execution-guard";
describe("Sprint 06: prevent overlapping admin/cron starts", () => {
  it("allows one owner then denies concurrent duplicate execution", () => {
    const guard = makeGrowthExecutionGuard();
    expect(guard.acquire()).toBe(true);
    expect(guard.acquire()).toBe(false);
    expect(guard.isRunning()).toBe(true);
    guard.release();
    expect(guard.acquire()).toBe(true);
    guard.release();
  });
  it("keeps independent instances separate; cross-process DB lock remains necessary", () => {
    const a = makeGrowthExecutionGuard(), b = makeGrowthExecutionGuard();
    expect(a.acquire()).toBe(true);
    expect(b.acquire()).toBe(true);
    a.release(); b.release();
  });
});

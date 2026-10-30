import { describe, expect, it } from "vitest";
import { initialGrowthRunState, growthRunStarted, growthRunCompleted, growthRunFailed, growthRuntimeHealth } from "../lib/growth-runtime-state";
const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 10, minute));
describe("Sprint 05 – observable growth runtime", () => {
  it("reports no false healthy signal before first real execution", () => {
    expect(growthRuntimeHealth(initialGrowthRunState(), at(0)).stale).toBe(true);
  });
  it("records genuine draft output, then marks heartbeat stale after inactivity", () => {
    let state = growthRunStarted(initialGrowthRunState(), at(0));
    state = growthRunCompleted(state, { generated: 2, skipped: null }, at(1));
    expect(growthRuntimeHealth(state, at(5), 10)).toMatchObject({ stale: false, lastOutcome: "drafts", consecutiveFailures: 0 });
    expect(growthRuntimeHealth(state, at(25), 10).stale).toBe(true);
  });
  it("does not hide invalid data as no-change success", () => {
    const state = growthRunCompleted(initialGrowthRunState(), {generated: 0, skipped: "invalid-growth-data"}, at(1));
    expect(state.lastOutcome).toBe("blocked");
  });
  it("tracks repeated failures and clears them only after a real completed cycle", () => {
    let state = growthRunFailed(initialGrowthRunState(), at(1));
    state = growthRunFailed(state, at(2));
    expect(state.consecutiveFailures).toBe(2);
    state = growthRunCompleted(state, { generated: 0, skipped: "no-new-evidence" }, at(3));
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastOutcome).toBe("no-change");
  });
});

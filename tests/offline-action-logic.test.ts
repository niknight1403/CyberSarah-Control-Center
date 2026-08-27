import { describe, expect, it } from "vitest";
import { canApplyOfflineAction, enqueueOfflineAction, getNextOfflineAction, markOfflineActionFailed, markOfflineActionRetry } from "../lib/offline-action-logic";

describe("offline action logic", () => {
  const input = {
    id: "action-1",
    repositoryId: "repo-1",
    kind: "push" as const,
    summary: "Push reviewed workspace changes",
    createdAt: "2026-08-27T00:00:00.000Z",
    hasConflictRisk: false,
  };

  it("queues an action with a bounded initial state", () => {
    expect(enqueueOfflineAction(input)).toMatchObject({ attempts: 0, status: "queued" });
  });

  it("returns the next pending action only for its repository", () => {
    const action = enqueueOfflineAction(input);
    expect(getNextOfflineAction([action], "repo-1")).toEqual(action);
    expect(getNextOfflineAction([action], "repo-2")).toBeUndefined();
  });

  it("increments attempts and preserves conflict risk", () => {
    const action = enqueueOfflineAction(input);
    expect(markOfflineActionRetry(action, true)).toMatchObject({ attempts: 1, status: "retrying", hasConflictRisk: true });
  });

  it("blocks offline or conflicting actions and marks failures", () => {
    const action = enqueueOfflineAction(input);
    expect(canApplyOfflineAction(action, false)).toBe(false);
    expect(canApplyOfflineAction(markOfflineActionRetry(action, true), true)).toBe(false);
    expect(markOfflineActionFailed(action).status).toBe("failed");
  });
});

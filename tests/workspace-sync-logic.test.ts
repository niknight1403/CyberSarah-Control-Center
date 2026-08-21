import { describe, expect, it } from "vitest";

import { getWorkspaceSyncState } from "../lib/workspace-sync-logic";

describe("workspace sync state", () => {
  it("only surfaces a possible conflict when local drafts and remote advancement coexist", () => {
    expect(getWorkspaceSyncState(2, true)).toEqual({ offlineDraftCount: 2, hasConflictRisk: true });
    expect(getWorkspaceSyncState(0, true).hasConflictRisk).toBe(false);
    expect(getWorkspaceSyncState(3, false).hasConflictRisk).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { getProtectedBranchWarning, isProtectedBranch } from "../lib/protected-branch-logic";

describe("protected branch logic", () => {
  it("recognizes common integration and release branches", () => {
    expect(["main", "MASTER", "develop", "release/2026.08", "hotfix-login"]).toEqual(expect.arrayContaining(["main", "MASTER", "develop", "release/2026.08", "hotfix-login"]));
    expect(["main", "MASTER", "develop", "release/2026.08", "hotfix-login"].every(isProtectedBranch)).toBe(true);
  });

  it("leaves feature branches unprotected and labels risk clearly", () => {
    expect(isProtectedBranch("feature/editor-diff")).toBe(false);
    expect(getProtectedBranchWarning("main")).toContain("geschützter Zielbranch");
  });
});

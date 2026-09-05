import { describe, expect, it } from "vitest";
import { assessConflict, planSync } from "../lib/conflict-resolution-logic";

describe("conflict resolution logic", () => {
  it("marks identical files as safe", () => {
    const result = assessConflict({ path: "a.ts", localHash: "h1", remoteHash: "h1", baseHash: "h1" });
    expect(result.kind).toBe("identical");
    expect(result.safeAutoResolve).toBe(true);
  });

  it("auto-resolves local-only files by keeping local", () => {
    const result = assessConflict({ path: "a.ts", localHash: "h1", remoteHash: null, baseHash: null });
    expect(result.kind).toBe("local-only");
    expect(result.resolution).toBe("keep-local");
    expect(result.safeAutoResolve).toBe(true);
  });

  it("auto-resolves remote-only files by keeping remote", () => {
    const result = assessConflict({ path: "a.ts", localHash: null, remoteHash: "h1", baseHash: null });
    expect(result.kind).toBe("remote-only");
    expect(result.resolution).toBe("keep-remote");
    expect(result.safeAutoResolve).toBe(true);
  });

  it("keeps remote when only the remote side changed", () => {
    const result = assessConflict({ path: "a.ts", localHash: "b", remoteHash: "r", baseHash: "b" });
    expect(result.resolution).toBe("keep-remote");
    expect(result.safeAutoResolve).toBe(true);
  });

  it("keeps local when only the local side changed", () => {
    const result = assessConflict({ path: "a.ts", localHash: "l", remoteHash: "b", baseHash: "b" });
    expect(result.resolution).toBe("keep-local");
    expect(result.safeAutoResolve).toBe(true);
  });

  it("requires a manual decision for real conflicts", () => {
    const result = assessConflict({ path: "a.ts", localHash: "l", remoteHash: "r", baseHash: "b" });
    expect(result.kind).toBe("both-changed-different");
    expect(result.resolution).toBe("needs-manual");
    expect(result.safeAutoResolve).toBe(false);
  });

  it("plans the whole sync set and blocks on any manual conflict", () => {
    const plan = planSync([
      { path: "clean.ts", localHash: "h", remoteHash: "h", baseHash: "h" },
      { path: "conflict.ts", localHash: "l", remoteHash: "r", baseHash: "b" },
    ]);
    expect(plan.autoResolvableCount).toBe(1);
    expect(plan.manualCount).toBe(1);
    expect(plan.blocked).toBe(true);
  });

  it("does not block a fully auto-resolvable sync", () => {
    const plan = planSync([{ path: "a.ts", localHash: "h", remoteHash: "h", baseHash: "h" }]);
    expect(plan.blocked).toBe(false);
    expect(plan.manualCount).toBe(0);
  });
});

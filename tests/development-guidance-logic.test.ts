import { describe, expect, it } from "vitest";
import { getDevelopmentGuidance } from "../lib/development-guidance-logic";

const readyInput = { hasWorkspaceService: true, hasRepository: true, changedFileCount: 0, hasConflictRisk: false, serviceHealthy: true, ciState: "ready" as const, ciFailed: 0, branch: "release", lastGitAction: "idle" as const };

describe("development guidance", () => {
  it("prioritizes secure service configuration before project actions", () => {
    const guidance = getDevelopmentGuidance({ ...readyInput, hasWorkspaceService: false, hasRepository: false, serviceHealthy: false });
    expect(guidance.primary.action).toBe("settings");
    expect(guidance.primary.title).toContain("Workspace-Service");
  });

  it("elevates remote conflicts above committing local drafts", () => {
    const guidance = getDevelopmentGuidance({ ...readyInput, changedFileCount: 2, hasConflictRisk: true });
    expect(guidance.primary.action).toBe("reviewChanges");
    expect(guidance.primary.tone).toBe("warning");
  });

  it("shows the agent as the productive next step once the workspace is healthy", () => {
    const guidance = getDevelopmentGuidance({ ...readyInput, lastGitAction: "pushed" });
    expect(guidance.primary.action).toBe("agent");
    expect(guidance.completion).toContain("veröffentlicht");
  });
});

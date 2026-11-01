import { describe, expect, it } from "vitest";
import { resolveDeploymentInfo } from "../lib/deployment-info";

describe("Deployment Info & /api/ready (Abschluss-Fix)", () => {
  it("nutzt GIT_COMMIT_SHA aus den Environment-Variablen falls vorhanden", () => {
    const info = resolveDeploymentInfo({ GIT_COMMIT_SHA: "abc123def4567890123456789012345678901234" });
    expect(info.gitCommitSha).toBe("abc123def4567890123456789012345678901234");
    expect(info.gitCommitShaReason).toBeNull();
  });

  it("nutzt RENDER_GIT_COMMIT als Fallback-ENV", () => {
    const info = resolveDeploymentInfo({ RENDER_GIT_COMMIT: "rendercommit1234567890123456789012345" });
    expect(info.gitCommitSha).toBe("rendercommit1234567890123456789012345");
    expect(info.gitCommitShaReason).toBeNull();
  });

  it("nutzt GITHUB_SHA als Fallback-ENV", () => {
    const info = resolveDeploymentInfo({ GITHUB_SHA: "githubsha12345678901234567890123456" });
    expect(info.gitCommitSha).toBe("githubsha12345678901234567890123456");
    expect(info.gitCommitShaReason).toBeNull();
  });

  it("nutzt den Git-Resolver falls keine ENV vorhanden ist", () => {
    const mockGitSha = "1234567890abcdef1234567890abcdef12345678";
    const info = resolveDeploymentInfo({}, () => mockGitSha);
    expect(info.gitCommitSha).toBe(mockGitSha);
    expect(info.gitCommitShaReason).toBeNull();
  });

  it("liefer ehrliches null und Grund, wenn weder ENV noch Git verfuegbar sind", () => {
    const info = resolveDeploymentInfo({}, () => {
      throw new Error("Git not installed or not a git repository");
    });
    expect(info.gitCommitSha).toBeNull();
    expect(info.gitCommitShaReason).toContain("Keine Commit-SHA via Environment-Variablen oder Git-Repository verfuegbar.");
  });

  it("verwendet DEPLOYED_AT oder faellt auf Startzeit-Zeitstempel zurueck", () => {
    const customTime = "2026-10-02T03:00:00.000Z";
    const infoEnv = resolveDeploymentInfo({ DEPLOYED_AT: customTime });
    expect(infoEnv.deployedAt).toBe(customTime);

    const infoDefault = resolveDeploymentInfo({});
    expect(infoDefault.deployedAt).toBeDefined();
    expect(typeof infoDefault.deployedAt).toBe("string");
  });
});

import { describe, expect, it } from "vitest";
import { CYBERSARAH_REVENUE_REPOSITORY_URL, parseRepositoryChatIntent, normalizeBranch, normalizeRepositoryUrl } from "../lib/repository-intent-logic";

describe("repository chat intent", () => {
  it("detects the CyberSarah-revenue-os connect request and requires confirmation", () => {
    expect(parseRepositoryChatIntent("Verbinde CyberSarah-revenue-os mit dem Chat.")).toEqual({
      type: "connect_repository",
      repositoryUrl: CYBERSARAH_REVENUE_REPOSITORY_URL,
      branch: "main",
      needsConfirmation: true,
    });
  });

  it("extracts a safe GitHub URL and branch", () => {
    expect(parseRepositoryChatIntent("Verbinde https://github.com/example/project.git, Branch release/1.0")).toMatchObject({
      type: "connect_repository",
      repositoryUrl: "https://github.com/example/project",
      branch: "release/1.0",
      needsConfirmation: true,
    });
  });

  it("rejects non-HTTPS, credential-bearing, and malformed URLs", () => {
    expect(normalizeRepositoryUrl("http://github.com/example/project")).toBeNull();
    expect(normalizeRepositoryUrl("https://user:pass@github.com/example/project")).toBeNull();
    expect(normalizeRepositoryUrl("https://github.com/example/project?token=secret")).toBeNull();
    expect(normalizeRepositoryUrl("not-a-repository")).toBeNull();
  });

  it("normalizes unsafe branch values to main", () => {
    expect(normalizeBranch("release/2026")).toBe("release/2026");
    expect(normalizeBranch("../secrets")).toBe("main");
  });
});

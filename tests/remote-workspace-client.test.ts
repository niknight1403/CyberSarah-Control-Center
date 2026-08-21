import { describe, expect, it } from "vitest";
import { buildWorkspaceHeaders } from "../lib/remote-workspace-client";
import { getRepositoryLabel, toPersistedStudioSettings } from "../lib/studio-settings-logic";

describe("workspace service client", () => {
  it("builds request-only headers for configured credentials", () => {
    expect(
      buildWorkspaceHeaders({
        baseUrl: "https://studio.example.com",
        serviceAccessToken: "service-secret",
        githubToken: "github-secret",
        provider: "openai",
        providerApiKey: "provider-secret",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer service-secret",
      "X-GitHub-Token": "github-secret",
      "X-AI-Provider": "openai",
      "X-AI-Provider-Key": "provider-secret",
    });
  });

  it("reduces a repository URL to a concise workspace label", () => {
    expect(getRepositoryLabel("https://github.com/example-org/custom-ai-studio.git")).toBe("example-org/custom-ai-studio");
  });

  it("normalizes the non-sensitive saved workspace preferences", () => {
    expect(
      toPersistedStudioSettings({
        workspaceUrl: " https://studio.example.com/// ",
        repositoryUrl: " https://github.com/example-org/custom-ai-studio.git ",
        branch: " ",
        provider: "managed",
      }),
    ).toEqual({
      workspaceUrl: "https://studio.example.com",
      repositoryUrl: "https://github.com/example-org/custom-ai-studio.git",
      branch: "main",
      provider: "managed",
    });
  });
});

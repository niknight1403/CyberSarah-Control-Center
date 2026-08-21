import { describe, expect, it, vi } from "vitest";
import { buildWorkspaceHeaders, RemoteWorkspaceClient } from "../lib/remote-workspace-client";
import { getRepositoryLabel, toPersistedStudioSettings } from "../lib/studio-settings-logic";

describe("workspace service client", () => {
  it("builds request-only headers for configured credentials", () => {
    expect(buildWorkspaceHeaders({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret", githubToken: "github-secret", provider: "openai", providerApiKey: "provider-secret" })).toEqual({
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
    expect(toPersistedStudioSettings({ workspaceUrl: " https://studio.example.com/// ", repositoryUrl: " https://github.com/example-org/custom-ai-studio.git ", branch: " ", provider: "managed" })).toEqual({
      workspaceUrl: "https://studio.example.com",
      repositoryUrl: "https://github.com/example-org/custom-ai-studio.git",
      branch: "main",
      provider: "managed",
    });
  });

  it("uses the typed branch and commit endpoints for a connected workspace", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ currentBranch: "main", branches: ["main", "release"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "release", files: ["README.md"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commits: [{ shortHash: "a1b2c3d", message: "Fixture", author: "Test", committedAt: "2026-08-21T00:00:00Z", hash: "a1b2c3d4" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RemoteWorkspaceClient({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret" });
    await expect(client.listBranches("workspace")).resolves.toEqual({ currentBranch: "main", branches: ["main", "release"] });
    await expect(client.checkoutBranch("workspace", "release")).resolves.toEqual({ branch: "release", files: ["README.md"] });
    await expect(client.listCommits("workspace")).resolves.toMatchObject({ commits: [{ shortHash: "a1b2c3d" }] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://studio.example.com/api/v1/workspaces/workspace/git/branches",
      "https://studio.example.com/api/v1/workspaces/workspace/git/checkout",
      "https://studio.example.com/api/v1/workspaces/workspace/git/commits?limit=10",
    ]);
    vi.unstubAllGlobals();
  });

  it("writes changed files, then addresses the commit and push endpoints for one workspace", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true, path: "src/fixture.ts" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ committed: true, hash: "c0ffee1", output: "" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pushed: true, branch: "main", output: "" }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RemoteWorkspaceClient({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret" });
    await expect(client.writeFile("workspace", "src/fixture.ts", "export const updated = true;\n")).resolves.toMatchObject({ saved: true });
    await expect(client.commit("workspace", "Update fixture")).resolves.toMatchObject({ hash: "c0ffee1" });
    await expect(client.push("workspace")).resolves.toMatchObject({ branch: "main" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://studio.example.com/api/v1/workspaces/workspace/file",
      "https://studio.example.com/api/v1/workspaces/workspace/git/commit",
      "https://studio.example.com/api/v1/workspaces/workspace/git/push",
    ]);
    vi.unstubAllGlobals();
  });
});

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
    expect(toPersistedStudioSettings({ workspaceUrl: " https://studio.example.com/// ", repositoryUrl: " https://github.com/example-org/custom-ai-studio.git ", branch: " ", provider: "managed", protectChatContent: false })).toEqual({
      workspaceUrl: "https://studio.example.com",
      repositoryUrl: "https://github.com/example-org/custom-ai-studio.git",
      branch: "main",
      provider: "managed",
      protectChatContent: false,
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

  it("creates a pull request only through the typed post-push endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ number: 17, url: "https://github.com/example/repo/pull/17", state: "open", title: "Ship feature", headBranch: "release", baseBranch: "main" }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RemoteWorkspaceClient({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret" });
    await expect(client.createPullRequest("workspace", { baseBranch: "main", title: "Ship feature", body: "Ready for review." })).resolves.toMatchObject({ number: 17, headBranch: "release" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://studio.example.com/api/v1/workspaces/workspace/git/pull-request");
    vi.unstubAllGlobals();
  });

  it("loads merge readiness and CI results from the typed quality endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "release", pullRequest: { number: 1, title: "Ship", url: "https://github.com/example/repo/pull/1", headBranch: "release", baseBranch: "main" }, merge: { state: "ready", label: "Merge bereit" }, ci: { state: "passed", label: "CI bestanden", total: 1, passed: 1, failed: 0, pending: 0, checks: [] } }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RemoteWorkspaceClient({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret" });
    await expect(client.getRepositoryQuality("workspace")).resolves.toMatchObject({ branch: "release", merge: { state: "ready" }, ci: { state: "passed" } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://studio.example.com/api/v1/workspaces/workspace/git/quality");
    vi.unstubAllGlobals();
  });

  it("sends a bounded development request with the active file to the proposal endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ summary: "Use a shared token.", rationale: "It prevents duplicated constants.", changes: [{ path: "src/fixture.ts", content: "export const token = 1;\n", explanation: "Centralize the value." }], affectedFiles: ["src/fixture.ts"] }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RemoteWorkspaceClient({ baseUrl: "https://studio.example.com", serviceAccessToken: "service-secret", provider: "managed" });
    await expect(client.requestAgentProposal({ prompt: "Extract a shared token", activeFile: "src/fixture.ts" })).resolves.toMatchObject({ changes: [{ path: "src/fixture.ts" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://studio.example.com/api/v1/agent/proposals");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ prompt: "Extract a shared token", activeFile: "src/fixture.ts" }));
    vi.unstubAllGlobals();
  });
});

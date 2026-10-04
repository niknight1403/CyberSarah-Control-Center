import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGithubRepositories } from "@/lib/github-api-client";

describe("fetchGithubRepositories", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verlangt ein nicht-leeres Token ohne HTTP-Aufruf", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchGithubRepositories("  ")).rejects.toThrow("Kein GitHub-Token hinterlegt.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendet Token und API-Version und gibt geparste Repositories zurück", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 7, name: "control-center", full_name: "cyber/control-center", private: true, description: null, html_url: "https://github.com/cyber/control-center", default_branch: "main", updated_at: "2026-10-01T00:00:00Z", owner: { login: "cyber", avatar_url: "https://example.test/avatar.png" } },
    ]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const repositories = await fetchGithubRepositories(" token ", signal);
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }), signal,
    }));
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({ id: 7, fullName: "cyber/control-center", defaultBranch: "main" });
  });

  it.each([
    [401, "GitHub-Token ist ungültig oder abgelaufen."],
    [403, "GitHub hat die Anfrage abgelehnt (Rate-Limit oder fehlende Berechtigung)."],
    [503, "GitHub-API antwortete mit Status 503."],
  ])("übersetzt HTTP %i in eine verständliche Fehlermeldung", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(fetchGithubRepositories("token")).rejects.toThrow(message);
  });
});

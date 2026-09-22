import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 198 — Unit-Tests fuer die GitHub-Autonomie-Tools des Orchestrators.
 * Der HTTP-Client ist gemockt: Kein echter API-Call, Determinismus.
 */

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockPost = vi.fn();

vi.mock("axios", () => ({
  create: vi.fn(() => ({
    get: (...a: unknown[]) => mockGet(...a),
    put: (...a: unknown[]) => mockPut(...a),
    post: (...a: unknown[]) => mockPost(...a),
  })),
}));

import { executeTool } from "@/server/orchestrator/tool-registry";

function b64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_GITHUB_TOKEN = "ghp_unit_test_token";
});

afterEach(() => {
  delete process.env.ADMIN_GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

describe("git.getFileContents", () => {
  it("liefert dekodierten Dateiinhalt mit SHA", async () => {
    mockGet.mockResolvedValueOnce({
      data: { content: b64("export const x = 1;"), encoding: "base64", sha: "abc123", size: 18 },
    });
    const r = await executeTool("git.getFileContents", { path: "lib/x.ts" });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      repo: "niknight1403/CyberSarah-Control-Center",
      path: "lib/x.ts",
      sha: "abc123",
      content: "export const x = 1;",
      truncated: false,
    });
  });

  it("liefert fuer Verzeichnispfade eine Dateiliste", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        { name: "a.ts", type: "file", size: 10 },
        { name: "b", type: "dir", size: 0 },
      ],
    });
    const r = await executeTool("git.getFileContents", { path: "lib" });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ type: "directory" });
    expect((r.result as { entries: { name: string }[] }).entries.map((e) => e.name)).toEqual(["a.ts", "b"]);
  });
});

describe("git.commitFile", () => {
  it("aktualisiert eine bestehende Datei mit automatisch ermitteltem SHA", async () => {
    mockGet.mockResolvedValueOnce({ data: { sha: "old-sha" } });
    mockPut.mockResolvedValueOnce({ data: { commit: { sha: "f00c0ffee" }, content: { html_url: "https://github.com/x" } } });
    const r = await executeTool("git.commitFile", { path: "lib/y.ts", content: "neu", message: "fix(lib): y korrigiert" });
    expect(r.ok).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(
      "/repos/niknight1403/CyberSarah-Control-Center/contents/lib/y.ts",
      expect.objectContaining({ message: "fix(lib): y korrigiert", sha: "old-sha", content: b64("neu") }),
    );
    expect((r.result as { commit: string }).commit).toBe("f00c0ff");
  });

  it("legt eine neue Datei an, wenn der Contents-Lookup 404 liefert", async () => {
    const err = Object.assign(new Error("404"), { response: { status: 404 } });
    mockGet.mockRejectedValueOnce(err);
    mockPut.mockResolvedValueOnce({ data: { commit: { sha: "newcommit123" }, content: { html_url: "u" } } });
    const r = await executeTool("git.commitFile", { path: "neu.ts", content: "x", message: "feat: neu" });
    expect(r.ok).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sha: undefined, content: b64("x") }),
    );
    expect((r.result as { created: boolean }).created).toBe(true);
  });

  it("lehnt leere Commit-Nachricht ab", async () => {
    const r = await executeTool("git.commitFile", { path: "a.ts", content: "x", message: "  " });
    expect(r.ok).toBe(false);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe("git.createBranch", () => {
  it("blockt ungueltige Branch-Namen", async () => {
    for (const bad of ["", "a~b", "a:b", "-startet-mit-strich", "a\\b"]) {
      const r = await executeTool("git.createBranch", { branchName: bad });
      expect(r.ok).toBe(false);
    }
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("erstellt einen Branch auf Basis des Default-Branches", async () => {
    mockGet.mockResolvedValueOnce({ data: { default_branch: "main" } });
    mockGet.mockResolvedValueOnce({ data: { object: { sha: "base123" } } });
    mockPost.mockResolvedValueOnce({ data: {} });
    const r = await executeTool("git.createBranch", { branchName: "agent/neue-funktion" });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ branch: "agent/neue-funktion", from: "main" });
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/git/refs"),
      expect.objectContaining({ ref: "refs/heads/agent/neue-funktion", sha: "base123" }),
    );
  });
});

describe("git.dispatchServerOps", () => {
  it("weist Operationen ausserhalb der Allowlist ab", async () => {
    const r = await executeTool("git.dispatchServerOps", { operation: "rm -rf /" });
    expect(r.ok).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("dispatcht eine freigegebene Operation auf main", async () => {
    mockPost.mockResolvedValueOnce({ status: 204 });
    const r = await executeTool("git.dispatchServerOps", { operation: "db-migrate" });
    expect(r.ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      "/repos/niknight1403/CyberSarah-Control-Center/actions/workflows/server-ops.yml/dispatches",
      { ref: "main", inputs: { operation: "db-migrate" } },
    );
  });
});

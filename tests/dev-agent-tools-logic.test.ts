import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_DEFINITIONS,
  AGENT_TOOL_NAMES,
  buildAgentSystemPrompt,
  buildWorkspaceToolRequest,
  formatToolResultForModel,
  isAgentToolName,
  MAX_FILE_CONTENT_CHARS,
  parseToolArguments,
} from "../lib/dev-agent-tools-logic";

describe("dev-agent-tools-logic (Sprint 88)", () => {
  it("kennt genau die dokumentierten Werkzeugnamen", () => {
    expect(AGENT_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual([...AGENT_TOOL_NAMES]);
    expect(isAgentToolName("read_repo_file")).toBe(true);
    expect(isAgentToolName("delete_everything")).toBe(false);
  });

  it("parst gueltige und fehlerhafte Tool-Argumente sicher", () => {
    expect(parseToolArguments('{"path":"a.ts"}')).toEqual({ path: "a.ts" });
    expect(parseToolArguments("kein-json")).toEqual({});
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments(undefined)).toEqual({});
    expect(parseToolArguments("[1,2,3]")).toEqual({});
  });

  it("list_repo_files und git_status/push_changes brauchen keine Argumente", () => {
    expect(buildWorkspaceToolRequest("list_repo_files", "ws1", {})).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/files" },
    });
    expect(buildWorkspaceToolRequest("git_status", "ws1", {})).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/git/status" },
    });
    expect(buildWorkspaceToolRequest("push_changes", "ws1", {})).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/git/push" },
    });
  });

  it("read_repo_file verlangt einen nicht-leeren Pfad und kodiert ihn", () => {
    const ok = buildWorkspaceToolRequest("read_repo_file", "ws1", { path: "server/db.ts" });
    expect(ok).toEqual({ ok: true, request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/file?path=server%2Fdb.ts" } });

    const missing = buildWorkspaceToolRequest("read_repo_file", "ws1", {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/path/);
  });

  it("write_repo_file verlangt path und content als String", () => {
    const ok = buildWorkspaceToolRequest("write_repo_file", "ws1", { path: "a.ts", content: "export const a = 1;" });
    expect(ok).toEqual({
      ok: true,
      request: { method: "PUT", path: "/api/render/api/v1/workspaces/ws1/file", body: { path: "a.ts", content: "export const a = 1;" } },
    });

    const noContent = buildWorkspaceToolRequest("write_repo_file", "ws1", { path: "a.ts" });
    expect(noContent.ok).toBe(false);

    const tooBig = buildWorkspaceToolRequest("write_repo_file", "ws1", { path: "a.ts", content: "x".repeat(1_000_001) });
    expect(tooBig.ok).toBe(false);
  });

  it("commit_changes verlangt eine Message, push braucht keine Argumente", () => {
    const ok = buildWorkspaceToolRequest("commit_changes", "ws1", { message: "fix: bug" });
    expect(ok).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/git/commit", body: { message: "fix: bug" } },
    });
    const missing = buildWorkspaceToolRequest("commit_changes", "ws1", {});
    expect(missing.ok).toBe(false);
  });

  it("open_pull_request verlangt title (>=3 Zeichen) und baseBranch, body ist optional", () => {
    const ok = buildWorkspaceToolRequest("open_pull_request", "ws1", { title: "Feature X", baseBranch: "main" });
    expect(ok).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/git/pull-request", body: { title: "Feature X", baseBranch: "main", body: "" } },
    });
    const tooShortTitle = buildWorkspaceToolRequest("open_pull_request", "ws1", { title: "ab", baseBranch: "main" });
    expect(tooShortTitle.ok).toBe(false);
    const missingBranch = buildWorkspaceToolRequest("open_pull_request", "ws1", { title: "Feature X" });
    expect(missingBranch.ok).toBe(false);
  });

  it("formatToolResultForModel formatiert jedes Werkzeugergebnis deterministisch", () => {
    expect(formatToolResultForModel("list_repo_files", { files: ["a.ts", "b.ts"] })).toBe("2 von 2 Dateien:\na.ts\nb.ts");
    expect(formatToolResultForModel("read_repo_file", { content: "hello" })).toBe("hello");
    expect(formatToolResultForModel("write_repo_file", { saved: true, path: "a.ts" })).toBe("Datei 'a.ts' erfolgreich gespeichert.");
    expect(formatToolResultForModel("git_status", { status: "## main", localAhead: true })).toBe("## main (lokale Commits noch nicht gepusht)");
    expect(formatToolResultForModel("commit_changes", { committed: true, hash: "abc123" })).toBe("Commit erstellt: abc123");
    expect(formatToolResultForModel("push_changes", { pushed: true, branch: "main" })).toBe("Branch 'main' erfolgreich gepusht.");
    expect(formatToolResultForModel("open_pull_request", { number: 7, html_url: "https://x" })).toBe("Pull Request #7 erstellt: https://x");
  });

  it("kuerzt sehr lange Dateiinhalte deterministisch", () => {
    const long = "a".repeat(MAX_FILE_CONTENT_CHARS + 500);
    const result = formatToolResultForModel("read_repo_file", { content: long });
    expect(result.length).toBeLessThan(long.length);
    expect(result).toMatch(/gekuerzt/);
  });

  it("buildAgentSystemPrompt nennt den Branch und alle Werkzeugnamen", () => {
    const prompt = buildAgentSystemPrompt("main");
    expect(prompt).toContain("main");
    for (const name of AGENT_TOOL_NAMES) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("get_provider_status");
    expect(prompt).toContain("voller Autoritaet");
    expect(prompt).toContain("list_github_issues");
    expect(prompt).toContain("create_github_issue");
    expect(prompt).toContain("checkout_branch");
  });

  it("baut Branch- und Issue-Werkzeug-Anfragen deterministisch (Sprint 140)", () => {
    expect(buildWorkspaceToolRequest("list_branches", "ws1", {})).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/git/branches" },
    });
    expect(buildWorkspaceToolRequest("checkout_branch", "ws1", { branch: "feature/chat-fix" })).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/git/checkout", body: { branch: "feature/chat-fix" } },
    });
    expect(buildWorkspaceToolRequest("checkout_branch", "ws1", {})).toEqual({ ok: false, error: "Das Argument 'branch' fehlt oder ist leer." });

    expect(buildWorkspaceToolRequest("list_github_issues", "ws1", {})).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/github/issues?state=open&limit=15" },
    });
    expect(buildWorkspaceToolRequest("list_github_issues", "ws1", { state: "CLOSED", limit: 99 })).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/github/issues?state=closed&limit=30" },
    });
    expect(buildWorkspaceToolRequest("list_github_issues", "ws1", { state: "unsinn", limit: "viele" })).toEqual({
      ok: true,
      request: { method: "GET", path: "/api/render/api/v1/workspaces/ws1/github/issues?state=open&limit=15" },
    });

    expect(buildWorkspaceToolRequest("create_github_issue", "ws1", { title: "Bug: Y", labels: ["bug", 5, " "] })).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/github/issues", body: { title: "Bug: Y", body: "", labels: ["bug"] } },
    });
    expect(buildWorkspaceToolRequest("create_github_issue", "ws1", { title: "ab" })).toEqual({
      ok: false,
      error: "Das Argument 'title' muss mindestens 3 Zeichen lang sein.",
    });

    expect(buildWorkspaceToolRequest("close_github_issue", "ws1", { number: 42, comment: "Erledigt." })).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/github/issues/close", body: { number: 42, comment: "Erledigt." } },
    });
    expect(buildWorkspaceToolRequest("close_github_issue", "ws1", { number: 42 })).toEqual({
      ok: true,
      request: { method: "POST", path: "/api/render/api/v1/workspaces/ws1/github/issues/close", body: { number: 42, comment: "" } },
    });
    expect(buildWorkspaceToolRequest("close_github_issue", "ws1", { number: 0 })).toEqual({
      ok: false,
      error: "Das Argument 'number' fehlt oder ist keine gueltige Issue-Nummer.",
    });
  });

  it("formatiert Branch- und Issue-Ergebnisse fuer das Modell (Sprint 140)", () => {
    expect(formatToolResultForModel("list_branches", { currentBranch: "main", branches: ["main", "dev"] })).toBe(
      "Aktuell: main\nRemote-Branches (2):\nmain\ndev",
    );
    expect(formatToolResultForModel("checkout_branch", { branch: "feature/x", branchOrigin: "local" })).toContain("neuer lokaler Branch");
    expect(formatToolResultForModel("checkout_branch", { branch: "main", branchOrigin: "remote" })).not.toContain("neuer lokaler Branch");

    const issueList = formatToolResultForModel("list_github_issues", {
      issues: [{ number: 7, title: "Deploy bricht", state: "open", labels: ["bug"], url: "https://github.com/x/y/issues/7" }],
    });
    expect(issueList).toContain("#7 (open) [bug] Deploy bricht");

    expect(formatToolResultForModel("list_github_issues", { issues: [] })).toBe("Keine Issues gefunden.");
    expect(formatToolResultForModel("create_github_issue", { number: 12, url: "https://github.com/x/y/issues/12" })).toContain("Issue #12 erstellt");
    expect(formatToolResultForModel("close_github_issue", { number: 12, state: "closed", closed: true })).toContain("Issue #12 geschlossen");
    expect(formatToolResultForModel("close_github_issue", { number: 12, state: "open", closed: false })).toContain("konnte nicht geschlossen werden");
  });

  it("buildAgentSystemPrompt nennt den aktiven Provider, wenn uebergeben (Sprint 138)", () => {
    const prompt = buildAgentSystemPrompt("main", "managed");
    expect(prompt).toContain("Provider 'managed'");
    expect(prompt).toContain("On-Server-LLM");
    expect(buildAgentSystemPrompt("main")).not.toContain("System-Hinweis:");
  });
});

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
  });

  it("buildAgentSystemPrompt nennt den aktiven Provider, wenn uebergeben (Sprint 138)", () => {
    const prompt = buildAgentSystemPrompt("main", "managed");
    expect(prompt).toContain("Provider 'managed'");
    expect(prompt).toContain("On-Server-LLM");
    expect(buildAgentSystemPrompt("main")).not.toContain("System-Hinweis:");
  });
});

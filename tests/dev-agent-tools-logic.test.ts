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

describe("dev-agent-tools-logic (Sprint 88 & Sprints 285-288)", () => {
  it("kennt genau die dokumentierten Werkzeugnamen", () => {
    expect(AGENT_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual([...AGENT_TOOL_NAMES]);
    expect(isAgentToolName("read_repo_file")).toBe(true);
    expect(isAgentToolName("multi_file_refactor")).toBe(true);
    expect(isAgentToolName("search_code")).toBe(true);
    expect(isAgentToolName("run_tests")).toBe(true);
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

  it("baut Anfragen für multi_file_refactor, search_code und run_tests deterministisch", () => {
    const refactorOk = buildWorkspaceToolRequest("multi_file_refactor", "ws1", {
      operations: [{ path: "a.ts", action: "write", content: "a" }],
    });
    expect(refactorOk.ok).toBe(true);

    const searchOk = buildWorkspaceToolRequest("search_code", "ws1", { query: "export function" });
    expect(searchOk.ok).toBe(true);

    const testOk = buildWorkspaceToolRequest("run_tests", "ws1", { testFile: "tests/a.test.ts" });
    expect(testOk.ok).toBe(true);
  });

  it("formatToolResultForModel formatiert Multi-File, Code-Suche und Test-Ergebnisse", () => {
    expect(formatToolResultForModel("multi_file_refactor", { success: true, appliedOps: 2 })).toContain("2 Datei(en)");
    expect(formatToolResultForModel("search_code", { matches: [{ path: "a.ts", lineNumber: 1, lineContent: "code" }] })).toContain("a.ts:1");
    expect(formatToolResultForModel("run_tests", { isSuccess: true, passed: 5 })).toContain("Test-Run erfolgreich: 5 bestanden");
  });

  it("buildAgentSystemPrompt nennt den Branch und alle Werkzeugnamen", () => {
    const prompt = buildAgentSystemPrompt("main");
    expect(prompt).toContain("main");
    for (const name of AGENT_TOOL_NAMES) {
      expect(prompt).toContain(name);
    }
  });
});

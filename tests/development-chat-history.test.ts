import { describe, expect, it } from "vitest";
import { DEVELOPMENT_CHAT_HISTORY_LIMIT, getDevelopmentChatHistoryKey, getDevelopmentChatHistoryScope, parseDevelopmentChatHistory, serializeDevelopmentChatHistory, splitProtectedHistory } from "../lib/development-chat-history-logic";

describe("development chat history", () => {
  it("creates isolated, SecureStore-compatible repository scopes", () => {
    expect(getDevelopmentChatHistoryScope("Workspace/Team Repo#42")).toBe("workspace-team-repo-42");
    expect(getDevelopmentChatHistoryKey("repo-a")).not.toBe(getDevelopmentChatHistoryKey("repo-b"));
    expect(getDevelopmentChatHistoryScope()).toBe("unattached");
  });

  it("persists a bounded conversation while retaining proposal metadata but never proposal file content", () => {
    const messages = Array.from({ length: DEVELOPMENT_CHAT_HISTORY_LIMIT + 3 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? "agent" as const : "user" as const,
      content: `Conversation ${index}`,
      proposalPreview: index === DEVELOPMENT_CHAT_HISTORY_LIMIT + 2 ? { affectedFiles: ["src/fixture.ts"], changes: [{ path: "src/fixture.ts", explanation: "Use a shared marker." }] } : undefined,
      proposal: { content: "export const secretImplementation = true;" },
    }));
    const serialized = serializeDevelopmentChatHistory(messages);
    const restored = parseDevelopmentChatHistory(serialized);
    expect(restored).toHaveLength(DEVELOPMENT_CHAT_HISTORY_LIMIT);
    expect(serialized).not.toContain("secretImplementation");
    expect(restored.at(-1)).toMatchObject({ state: "restored", proposalPreview: { affectedFiles: ["src/fixture.ts"] } });
  });

  it("ignores malformed or incompatible local history safely", () => {
    expect(parseDevelopmentChatHistory("not-json")).toEqual([]);
    expect(parseDevelopmentChatHistory(JSON.stringify({ version: 99, messages: [] }))).toEqual([]);
  });

  it("splits protected history into bounded secure-storage chunks without losing content", () => {
    const source = "sicherer-chat-".repeat(150);
    const chunks = splitProtectedHistory(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 420)).toBe(true);
    expect(chunks.join("")).toBe(source);
  });
});

describe("development chat history field validation", () => {
  it("bounds persisted fields, restores interrupted proposal states, and retains applied state", () => {
    const serialized = serializeDevelopmentChatHistory([
      { id: "i".repeat(120), role: "agent", content: "c".repeat(950), state: "applying", proposalPreview: { affectedFiles: Array.from({ length: 6 }, (_, i) => `file-${i}`), changes: Array.from({ length: 6 }, (_, i) => ({ path: `path-${i}`.repeat(100), explanation: "e".repeat(700) })) } },
      { id: "done", role: "agent", content: "finished", state: "applied", devTrace: Array.from({ length: 14 }, (_, i) => ({ tool: `tool-${i}`.repeat(20), args: "a".repeat(300), resultSummary: "r".repeat(400) })) },
    ]);
    const parsed = JSON.parse(serialized);
    expect(parsed.messages[0].id).toHaveLength(100);
    expect(parsed.messages[0].content).toHaveLength(900);
    expect(parsed.messages[0].state).toBe("ready");
    expect(parsed.messages[0].proposalPreview.affectedFiles).toHaveLength(4);
    expect(parsed.messages[0].proposalPreview.changes[0].path).toHaveLength(500);
    expect(parsed.messages[0].proposalPreview.changes[0].explanation).toHaveLength(600);
    expect(parsed.messages[1].devTrace).toHaveLength(12);
    expect(parsed.messages[1].devTrace[0].tool).toHaveLength(80);
    expect(parsed.messages[1].devTrace[0].args).toHaveLength(240);
    expect(parsed.messages[1].devTrace[0].resultSummary).toHaveLength(320);
    expect(parseDevelopmentChatHistory(serialized).at(-1)).toMatchObject({ state: "applied" });
  });

  it("filters invalid messages, proposal entries, and trace entries on restore", () => {
    const raw = JSON.stringify({ version: 1, messages: [
      null,
      { id: 1, role: "agent", content: "invalid id" },
      { id: "bad-role", role: "system", content: "invalid role" },
      { id: "ok", role: "user", content: "safe", state: "reverting", proposalPreview: { affectedFiles: ["valid", 4], changes: [{ path: "x", explanation: "y" }, { path: "broken" }, null] }, devTrace: [{ tool: "tool", args: "args", resultSummary: "result" }, { tool: "bad" }] },
    ] });
    expect(parseDevelopmentChatHistory(raw)).toEqual([{
      id: "ok", role: "user", content: "safe", state: "restored",
      proposalPreview: { affectedFiles: ["valid"], changes: [{ path: "x", explanation: "y" }] },
      devTrace: [{ tool: "tool", args: "args", resultSummary: "result" }],
    }]);
  });
});

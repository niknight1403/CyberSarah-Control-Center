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

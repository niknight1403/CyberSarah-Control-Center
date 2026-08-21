import { describe, expect, it } from "vitest";
import { DEVELOPMENT_CHAT_HISTORY_LIMIT, parseDevelopmentChatHistory, serializeDevelopmentChatHistory } from "../lib/development-chat-history";

describe("development chat history", () => {
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
});

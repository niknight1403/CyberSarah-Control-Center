import { describe, expect, it } from "vitest";
import {
  buildPersistableTurn,
  serverHistoryToChatRows,
  CHAT_HISTORY_ROLES,
  clampHistoryContent,
  historyToPromptMessages,
  normalizeHistoryRole,
  toDisplayHistory,
  type PersistedChatMessage,
} from "../lib/chat-history-logic";

const row = (overrides: Partial<PersistedChatMessage>): PersistedChatMessage => ({
  id: 1,
  userOpenId: "user-1",
  role: "user",
  content: "Hallo",
  provider: "managed",
  createdAt: new Date("2026-09-10T10:00:00Z"),
  ...overrides,
});

describe("chat-history-logic: Rollen", () => {
  it("normalisiert bekannte Rollen und lehnt unbekannte ab", () => {
    expect(normalizeHistoryRole("user")).toBe("user");
    expect(normalizeHistoryRole(" ASSISTANT ")).toBe("assistant");
    expect(normalizeHistoryRole("tool")).toBeNull();
    expect(normalizeHistoryRole(42)).toBeNull();
    expect(normalizeHistoryRole(null)).toBeNull();
    expect(CHAT_HISTORY_ROLES).toContain("system");
  });
});

describe("chat-history-logic: clampHistoryContent", () => {
  it("kuerzt ueberlange Inhalte auf das Maximum", () => {
    const long = "a".repeat(70_000);
    const clamped = clampHistoryContent(long);
    expect(clamped.length).toBe(64_000);
    expect(clampHistoryContent("kurz")).toBe("kurz");
    expect(clampHistoryContent("  \n  ")).toBe("  \n  ");
  });
});

describe("chat-history-logic: buildPersistableTurn", () => {
  it("liefert User- und Assistant-Nachricht mit Provider", () => {
    const turn = buildPersistableTurn({
      userContent: "  Baue mir X  ",
      assistantContent: "X ist gebaut.",
      provider: "openai",
    });
    expect(turn).not.toBeNull();
    expect(turn?.userMessage).toEqual({ role: "user", content: "Baue mir X" });
    expect(turn?.assistantMessage).toEqual({
      role: "assistant",
      content: "X ist gebaut.",
    });
    expect(turn?.provider).toBe("openai");
  });

  it("lehnt leere Turns ab und kappt lange Provider-Ids", () => {
    expect(buildPersistableTurn({ userContent: "", assistantContent: "x" })).toBeNull();
    expect(buildPersistableTurn({ userContent: "x", assistantContent: undefined })).toBeNull();
    expect(buildPersistableTurn({ userContent: "x", assistantContent: "y", provider: "p".repeat(40) })?.provider?.length).toBe(32);
    expect(buildPersistableTurn({ userContent: "x", assistantContent: "y", provider: "  " })?.provider).toBeNull();
  });
});

describe("chat-history-logic: historyToPromptMessages", () => {
  it("filtert ungueltige Rollen/leere Inhalte und kehrt zu aelteste-zuerst", () => {
    const rows = [
      row({ id: 3, role: "assistant", content: "Neue Antwort" }),
      row({ id: 2, role: "tool", content: "ungueltig" }),
      row({ id: 1, role: "user", content: "Alte Frage" }),
    ];
    const prompt = historyToPromptMessages(rows);
    expect(prompt).toEqual([
      { role: "user", content: "Alte Frage" },
      { role: "assistant", content: "Neue Antwort" },
    ]);
  });

  it("begrenzt auf die neuesten `limit` Nachrichten", () => {
    const rows = [5, 4, 3, 2, 1].map((id) => row({ id, content: `M${id}` }));
    expect(historyToPromptMessages(rows, 3)).toEqual([
      { role: "user", content: "M3" },
      { role: "user", content: "M4" },
      { role: "user", content: "M5" },
    ]);
    expect(historyToPromptMessages(rows, 0)).toEqual([]);
    expect(historyToPromptMessages("kaputt" as unknown as PersistedChatMessage[])).toEqual([]);
  });
});

describe("chat-history-logic: toDisplayHistory", () => {
  it("liefert chronologische UI-Zeilen mit ISO-Zeitstempel", () => {
    const rows = [
      row({ id: 2, role: "assistant", content: "Antwort", provider: null }),
      row({
        id: 1,
        role: "user",
        content: "Frage",
        createdAt: "2026-09-10T09:59:00Z",
      }),
    ];
    const display = toDisplayHistory(rows);
    expect(display).toHaveLength(2);
    expect(display[0]).toMatchObject({ id: 1, role: "user", content: "Frage", provider: "managed" });
    expect(display[0].createdAt).toBe("2026-09-10T09:59:00Z");
    expect(display[1].createdAt).toBe("2026-09-10T10:00:00.000Z");
  });

  it("laeuft robust gegen kaputte Zeilen", () => {
    expect(
      toDisplayHistory([null, row({ role: "keine", content: "x" }), row({ content: "" })] as unknown as PersistedChatMessage[]),
    ).toEqual([]);
  });
});

describe("chat-history-logic: serverHistoryToChatRows", () => {
  it("bildet Server-Zeilen auf UI-Zeilen ab (assistant → agent)", () => {
    const rows = [
      row({ id: 2, role: "assistant", content: "Antwort" }),
      row({ id: 1, role: "user", content: "Frage" }),
    ];
    expect(serverHistoryToChatRows(rows)).toEqual([
      {
        id: "server-1",
        role: "user",
        content: "Frage",
        timestampMs: Date.parse("2026-09-10T10:00:00Z"),
      },
      {
        id: "server-2",
        role: "agent",
        content: "Antwort",
        timestampMs: Date.parse("2026-09-10T10:00:00Z"),
      },
    ]);
    expect(serverHistoryToChatRows("kaputt" as unknown as PersistedChatMessage[])).toEqual([]);
  });
});

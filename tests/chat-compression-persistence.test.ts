import { describe, expect, it } from "vitest";
import { compressPersistedChatHistory } from "../lib/chat-compression-logic";

const T0 = "2026-09-11T12:00:00.000Z";

function row(id: number, role: "user" | "assistant", content: string, createdAt = T0, provider: string | null = "managed") {
  return { id, role, content, provider, createdAt: new Date(createdAt) };
}

describe("persistente Chat-Kompression (sprint 50)", () => {
  it("komprimiert beim Überschreiten der Grenze und liefert einen stabilen Verdauungseintrag", () => {
    // Datenbank liefert DESC (neueste zuerst)
    const rows = [row(6, "assistant", "Antwort 3"), row(5, "user", "Frage 3"), row(4, "assistant", "Antwort 2"), row(3, "user", "Frage 2"), row(2, "assistant", "Antwort 1"), row(1, "user", "Frage 1")];
    const result = compressPersistedChatHistory(rows, { maxMessages: 4 });
    expect(result.messages.map((message) => message.id)).toEqual([3, 4, 5, 6]);
    expect(result.messages[0]).toMatchObject({ id: 3, role: "user", content: "Frage 2", provider: "managed", createdAt: T0 });
    expect(result.digest).not.toBeNull();
    expect(result.digest?.removedCount).toBe(2);
    expect(result.digest?.summary).toBe("2 ältere Nachrichten wurden komprimiert.");
    // Stabiler Hash: gleiche Inhalte → gleicher FNV-1a-Hash
    expect(result.digest?.contentHash).toBe(
      compressPersistedChatHistory([...rows].reverse(), { maxMessages: 4 }).digest?.contentHash,
    );
  });

  it("lässt Kurzhistorien unkomprimiert (digest null)", () => {
    const rows = [row(2, "assistant", "Antwort"), row(1, "user", "Frage")];
    const result = compressPersistedChatHistory(rows, { maxMessages: 4 });
    expect(result.messages.map((message) => message.id)).toEqual([1, 2]);
    expect(result.digest).toBeNull();
  });

  it("verwirft ungültige Zeilen und bleibt deterministic", () => {
    const rows = [
      { id: 3, role: "system", content: "soll weg", createdAt: new Date(T0) },
      { id: 2, role: "user", content: "  ", createdAt: new Date(T0) },
      row(1, "user", "Bleibt"),
      null,
    ];
    const first = compressPersistedChatHistory(rows, { maxMessages: 10 });
    const second = compressPersistedChatHistory(rows, { maxMessages: 10 });
    expect(first.messages.map((message) => message.id)).toEqual([1]);
    expect(first.messages[0].role).toBe("user");
    expect(first).toEqual(second);
  });

  it("normalisiert Zeitstempel und Provider defensiv", () => {
    const result = compressPersistedChatHistory(
      [
        { id: 2, role: "assistant", content: "Neu", createdAt: "ungueltig", provider: undefined },
        { id: 1, role: "user", content: "Alt", createdAt: "2026-09-11T11:00:00.000Z" },
      ],
      { maxMessages: 10 },
    );
    expect(result.messages).toHaveLength(2);
    // Ungueltiger Zeitstempel zaehlt als aelteste Nachricht und bleibt erhalten
    expect(result.messages[0]).toMatchObject({ id: 2, provider: null, createdAt: "ungueltig" });
    expect(result.messages[1]).toMatchObject({ id: 1, createdAt: "2026-09-11T11:00:00.000Z" });
  });

  it("lehnt ungültige Eingaben deterministisch ab", () => {
    expect(() => compressPersistedChatHistory("kein Array", { maxMessages: 5 })).toThrow(
      "Persistierte Zeilen muessen ein Array sein.",
    );
    expect(() => compressPersistedChatHistory([], { maxMessages: 0 })).toThrow(
      "Das Nachrichtenlimit muss mindestens 1 sein.",
    );
  });
});

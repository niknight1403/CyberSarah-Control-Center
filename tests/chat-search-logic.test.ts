import { describe, expect, it } from "vitest";
import {
  buildSnippet,
  parseSearchQuery,
  searchChatMessages,
  validateSearchQuery,
  type SearchableMessage,
} from "../lib/chat-search-logic";

const base: SearchableMessage = {
  role: "assistant",
  sessionId: "default",
  title: "Deployment auf Render",
  content: "Richte den Render-Dienst ein und setze DATABASE_URL auf Neon.",
  createdAt: "2026-09-10T10:00:00.000Z",
};

describe("chat-search-logic", () => {
  it("zerlegt Suchanfragen tolerante und begrenzt auf 8 Terme", () => {
    expect(parseSearchQuery("  render   NEON ")).toEqual(["render", "neon"]);
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
    expect(parseSearchQuery("a b c d e f g h i j")).toHaveLength(8);
  });

  it("validiert leere Suchanfragen und lehnt sie ab", () => {
    expect(validateSearchQuery("render").valid).toBe(true);
    const empty = validateSearchQuery("  ");
    expect(empty.valid).toBe(false);
    if (!empty.valid) expect(empty.reason).toContain("leer");
  });

  it("findet Treffer gross-/klein-unabhaengig als UND-Verknuepfung", () => {
    const result = searchChatMessages([base], "RENDER neon");
    expect(result.totalMatches).toBe(1);
    expect(result.hits[0].snippet).toContain("Render-Dienst");

    expect(searchChatMessages([base], "render koyeb").totalMatches).toBe(0);
  });

  it("bewertet staerkere Treffer hoeher und sortiert danach", () => {
    const messages: SearchableMessage[] = [
      { ...base, content: "Render kurz. Neon.", createdAt: "2026-09-01T10:00:00.000Z" },
      { ...base, content: "Render und Neon zusammen einrichten.", createdAt: "2026-09-09T10:00:00.000Z" },
    ];
    const result = searchChatMessages(messages, "render neon");
    expect(result.hits[0].snippet).toContain("Render und Neon");
    expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
  });

  it("kappt lange Ergebnisse deterministisch mit Schnipsel-Markierung", () => {
    const long: SearchableMessage = {
      ...base,
      content: `${"Vorwort. ".repeat(30)} Gesuchter Begriff mitten im Text. ${"Nachwort. ".repeat(30)}`,
    };
    const result = searchChatMessages([long], "gesuchter");
    expect(result.hits[0].snippet.length).toBeLessThanOrEqual(165);
    expect(result.hits[0].snippet).toContain("Gesuchter");
    expect(result.hits[0].snippet).toContain("…");
    const short = buildSnippet("kurz", ["kurz"]);
    expect(short).toBe("kurz");
  });

  it("meldet abgeschnittene Ergebnismengen korrekt", () => {
    const many: SearchableMessage[] = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      createdAt: new Date(Date.UTC(2026, 8, 10, 0, i)).toISOString(),
    }));
    const result = searchChatMessages(many, "neon", 5);
    expect(result.hits).toHaveLength(5);
    expect(result.totalMatches).toBe(30);
    expect(result.truncated).toBe(true);
    expect(searchChatMessages(many, "neon", 5).hits[0]).toEqual(
      searchChatMessages(many, "neon", 5).hits[0],
    );
  });

  it("liefert bei leerer Anfrage strukturierte Leermenge", () => {
    expect(searchChatMessages([base], "")).toEqual({
      hits: [],
      totalMatches: 0,
      truncated: false,
    });
  });
});

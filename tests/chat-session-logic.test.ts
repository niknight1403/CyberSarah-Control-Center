import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_ID,
  buildSessionOverview,
  deriveSessionTitle,
  filterBySession,
  resolveTargetSessionId,
  sanitizeSessionId,
  type ChatMessageLike,
} from "../lib/chat-session-logic";

function msg(id: number, sessionId: string, role: string, createdAt: string): ChatMessageLike {
  return { id, sessionId, role, content: `Nachricht ${id}`, createdAt };
}

describe("chat-session-logic", () => {
  it("bereinigt Session-IDs mit Fallback auf die Standardsession", () => {
    expect(sanitizeSessionId("  projekt-idee  ")).toBe("projekt-idee");
    expect(sanitizeSessionId(null)).toBe(DEFAULT_SESSION_ID);
    expect(sanitizeSessionId("   ")).toBe(DEFAULT_SESSION_ID);
    expect(sanitizeSessionId("a\u0000b")).toBe("ab");
    expect(sanitizeSessionId("x".repeat(80))).toHaveLength(64);
  });

  it("leitet stabile Sitzungstitel aus der ersten Nutzerfrage ab", () => {
    expect(deriveSessionTitle("Wie deploye ich auf Render?")).toBe("Wie deploye ich auf Render?");
    expect(deriveSessionTitle("")).toBe("Neue Unterhaltung");
    expect(deriveSessionTitle("  Mehrzeilige\n  Frage  ")).toBe("Mehrzeilige Frage");
    const long = deriveSessionTitle("e".repeat(100));
    expect(long.length).toBeLessThanOrEqual(49);
    expect(long.endsWith("…")).toBe(true);
    const wordCut = deriveSessionTitle("Dies ist eine sehr lange Frage die am letzten Wort getrennt werden sollte");
    expect(wordCut.endsWith("…")).toBe(true);
    expect(wordCut).not.toContain("  ");
  });

  it("baut die Sitzungsuebersicht nach letzter Aktivitaet sortiert", () => {
    const overview = buildSessionOverview([
      msg(1, "default", "user", "2026-09-10T10:00:00Z"),
      msg(2, "default", "assistant", "2026-09-10T10:00:01Z"),
      msg(3, "neu", "user", "2026-09-10T11:00:00Z"),
    ]);
    expect(overview).toHaveLength(2);
    expect(overview[0].sessionId).toBe("neu");
    expect(overview[1].sessionId).toBe("default");
    expect(overview[0].title).toBe("Nachricht 3");
    expect(overview[1].messageCount).toBe(2);
    expect(overview[1].isDefault).toBe(true);
    expect(overview[0].isDefault).toBe(false);
  });

  it("vergisst Sitzungen ohne Nutzerfrage nicht, sondern titelt sie neutral", () => {
    const overview = buildSessionOverview([
      { id: 1, sessionId: "nur-bot", role: "assistant", content: "Antwort", createdAt: "2026-09-10T09:00:00Z" },
    ]);
    expect(overview[0].title).toBe("Neue Unterhaltung");
    expect(overview[0].messageCount).toBe(1);
  });

  it("filtert Nachrichten deterministisch auf eine Sitzung", () => {
    const messages = [
      msg(1, "a", "user", "2026-09-10T10:00:00Z"),
      msg(2, "b", "user", "2026-09-10T10:30:00Z"),
      msg(3, "a", "assistant", "2026-09-10T10:31:00Z"),
    ];
    expect(filterBySession(messages, "a").map((m) => m.id)).toEqual([1, 3]);
    expect(filterBySession(messages, "unbekannt")).toEqual([]);
    expect(filterBySession(messages, null)).toEqual([]);
  });

  it("erkennt neue Sitzungen anhand der bekannten IDs", () => {
    expect(resolveTargetSessionId("neu", ["default", "alt"]).isNewSession).toBe(true);
    expect(resolveTargetSessionId("default", ["default", "alt"]).isNewSession).toBe(false);
    expect(resolveTargetSessionId("  default  ", ["default"]).sessionId).toBe("default");
  });
});

import { describe, expect, it } from "vitest";
import { avatarInitialsForRole, formatChatClock, formatChatDay, senderLabelForRole, shouldShowDayDivider, shouldShowTimestamp, type TimestampedChatMessage } from "../lib/chat-presentation-logic";

describe("formatChatClock", () => {
  it("formatiert HH:MM mit führenden Nullen (24h, deutscher Standard)", () => {
    expect(formatChatClock(new Date(2026, 8, 7, 9, 5).getTime())).toBe("09:05");
    expect(formatChatClock(new Date(2026, 8, 7, 23, 59).getTime())).toBe("23:59");
    expect(formatChatClock(new Date(2026, 8, 7, 0, 0).getTime())).toBe("00:00");
  });
});

describe("formatChatDay", () => {
  const now = new Date(2026, 8, 7, 20, 0).getTime();

  it("kennt Heute und Gestern", () => {
    expect(formatChatDay(new Date(2026, 8, 7, 8, 0).getTime(), now)).toBe("Heute");
    expect(formatChatDay(new Date(2026, 8, 6, 8, 0).getTime(), now)).toBe("Gestern");
  });

  it("formatiert ältere Tage als Wochentag mit deutschem Datum", () => {
    expect(formatChatDay(new Date(2026, 8, 5, 8, 0).getTime(), now)).toBe("Samstag, 5. September");
    expect(formatChatDay(new Date(2025, 11, 24, 8, 0).getTime(), now)).toContain("Dezember");
  });
});

describe("shouldShowTimestamp", () => {
  const now = Date.now();

  it("zeigt den Zeitstempel für die erste Nachricht und Nachrichten ohne Vorgänger", () => {
    expect(shouldShowTimestamp(null, { role: "user", timestampMs: now })).toBe(true);
    expect(shouldShowTimestamp({ role: "agent" }, { role: "user", timestampMs: now })).toBe(true);
  });

  it("versteckt den Zeitstempel bei Nachrichten ohne eigenen Zeitstempel", () => {
    expect(shouldShowTimestamp({ role: "agent", timestampMs: now }, { role: "user" })).toBe(false);
  });

  it("zeigt den Zeitstempel erst ab 10 Minuten Abstand erneut", () => {
    const first: TimestampedChatMessage = { role: "user", timestampMs: now };
    expect(shouldShowTimestamp(first, { role: "agent", timestampMs: now + 9 * 60 * 1000 })).toBe(false);
    expect(shouldShowTimestamp(first, { role: "agent", timestampMs: now + 10 * 60 * 1000 })).toBe(true);
  });
});

describe("shouldShowDayDivider", () => {
  const now = new Date(2026, 8, 7, 20, 0).getTime();

  it("zeigt den Tages-Trenner für die erste Nachricht mit Zeitstempel", () => {
    expect(shouldShowDayDivider(null, { role: "agent", timestampMs: now })).toBe(true);
  });

  it("versteckt den Trenner bei Nachrichten ohne Zeitstempel", () => {
    expect(shouldShowDayDivider({ role: "user", timestampMs: now }, { role: "agent" })).toBe(false);
  });

  it("zeigt den Trenner nur bei Tageswechsel", () => {
    const previous: TimestampedChatMessage = { role: "user", timestampMs: new Date(2026, 8, 7, 8, 0).getTime() };
    expect(shouldShowDayDivider(previous, { role: "agent", timestampMs: new Date(2026, 8, 7, 9, 0).getTime() })).toBe(false);
    expect(shouldShowDayDivider(previous, { role: "agent", timestampMs: new Date(2026, 8, 8, 9, 0).getTime() })).toBe(true);
  });
});

describe("Rollen-Labels", () => {
  it("liefert Sende-Label und Avatar-Kürzel je Rolle", () => {
    expect(senderLabelForRole("user")).toBe("Du");
    expect(senderLabelForRole("agent")).toBe("Sarah · KI-Operations");
    expect(avatarInitialsForRole("user")).toBe("HN");
    expect(avatarInitialsForRole("agent")).toBe("CS");
  });
});

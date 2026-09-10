import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_CHAT_LIMIT,
  countMessagesToday,
  evaluateChatQuota,
  nextUtcMidnight,
  utcDayKey,
} from "../lib/chat-quota-logic";

const NOW = new Date("2026-09-10T15:30:00.000Z");

describe("chat-quota-logic", () => {
  it("bildet deterministische UTC-Tages-Schluessel", () => {
    expect(utcDayKey("2026-09-10T23:59:59.999Z")).toBe("2026-09-10");
    expect(utcDayKey("2026-09-11T00:00:00.001Z")).toBe("2026-09-11");
    expect(utcDayKey(NOW)).toBe("2026-09-10");
    expect(() => utcDayKey("gar-kein-datum")).toThrow();
  });

  it("berechnet die naechste UTC-Mitternacht korrekt (inkl. Monatswechsel)", () => {
    expect(nextUtcMidnight("2026-09-10T15:30:00.000Z").toISOString()).toBe(
      "2026-09-11T00:00:00.000Z",
    );
    expect(nextUtcMidnight("2026-09-30T23:59:59.999Z").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("zaehlt nur heutige Nutzer-Nachrichten (assistentenzahl egal)", () => {
    const messages = [
      { role: "user", createdAt: "2026-09-10T08:00:00.000Z" },
      { role: "assistant", createdAt: "2026-09-10T08:00:05.000Z" },
      { role: "user", createdAt: "2026-09-10T12:00:00.000Z" },
      { role: "user", createdAt: "2026-09-09T22:00:00.000Z" },
    ];
    expect(countMessagesToday(messages, NOW)).toBe(2);
    expect(countMessagesToday([], NOW)).toBe(0);
  });

  it("erlaubt Nutzung bis zum Limit und lehnt danach deterministisch ab", () => {
    const free = evaluateChatQuota({ dailyLimit: 3, role: "user" }, 2, NOW);
    expect(free.allowed).toBe(true);
    expect(free.remaining).toBe(1);
    expect(free.reason).toBeNull();

    const exhausted = evaluateChatQuota({ dailyLimit: 3, role: "user" }, 3, NOW);
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.remaining).toBe(0);
    expect(exhausted.reason).toContain("3/3");
    expect(exhausted.resetsAt).toBe("2026-09-11T00:00:00.000Z");
  });

  it("umgeht die Quote fuer Admins", () => {
    const admin = evaluateChatQuota({ dailyLimit: 3, role: "admin" }, 99, NOW);
    expect(admin.allowed).toBe(true);
    expect(admin.reason).toBeNull();
    expect(admin.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("verteidigt sich gegen unbrauchbare Limits und negative Zaehler", () => {
    const zeroLimit = evaluateChatQuota({ dailyLimit: 0, role: "user" }, 0, NOW);
    expect(zeroLimit.dailyLimit).toBe(1);
    expect(zeroLimit.allowed).toBe(true);
    const negative = evaluateChatQuota({ dailyLimit: 5, role: "user" }, -3, NOW);
    expect(negative.usedToday).toBe(0);
    expect(negative.remaining).toBe(5);
  });

  it("setzt ein sinnvolles Standardlimit", () => {
    expect(DEFAULT_DAILY_CHAT_LIMIT).toBeGreaterThan(10);
  });
});

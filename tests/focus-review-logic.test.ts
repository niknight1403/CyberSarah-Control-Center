import { describe, expect, it } from "vitest";

import {
  FOCUS_LIMITS,
  countDayFocus,
  createFocusItem,
  focusStatusLabel,
  hasDayCapacity,
  isIsoDay,
  isoDayFromTimestamp,
  validateFocusItem,
} from "../lib/focus-review-logic";

const VALID = { day: "2026-09-24", title: "LinkedIn-Post zur HARA-Demo finalisieren" };

describe("focus review core domain (Sprint 232)", () => {
  it("erzeugt normalisierte Fokus-Punkte mit sprechenden IDs", () => {
    const item = createFocusItem({ ...VALID, note: "  Kernaussage zuerst  " }, () => 1_000);
    expect(item.id).toMatch(/^focus-/);
    expect(item.status).toBe("active");
    expect(item.note).toBe("Kernaussage zuerst");
    expect(item.createdAt).toBe(1_000);
  });

  it("validiert Titel, Tag, Notiz und Status ehrlich", () => {
    expect(validateFocusItem({ ...VALID, title: "x" }).valid).toBe(false);
    expect(validateFocusItem({ day: "24.09.2026", title: "Gültiger Titel" }).valid).toBe(false);
    expect(validateFocusItem({ ...VALID, note: "x".repeat(500) }).valid).toBe(false);
    expect(validateFocusItem({ ...VALID, status: "pending" as never }).valid).toBe(false);
    expect(validateFocusItem(VALID).valid).toBe(true);
  });

  it("erkennt ISO-Tage und leitet sie aus Zeitstempeln ab", () => {
    expect(isIsoDay("2026-09-24")).toBe(true);
    expect(isIsoDay("2026-9-4")).toBe(false);
    expect(isoDayFromTimestamp(new Date(2026, 8, 24, 8, 30).getTime())).toBe("2026-09-24");
    expect(() => isoDayFromTimestamp(Number.NaN)).toThrow();
  });

  it("klemmt Tages-Kapazität bewusst bei drei Punkten", () => {
    const items = [1, 2, 3].map((n) => createFocusItem({ ...VALID, title: `Punkt ${n}` }));
    expect(countDayFocus(items, "2026-09-24")).toBe(3);
    expect(hasDayCapacity(items, "2026-09-24")).toBe(false);
    expect(hasDayCapacity(items, "2026-09-25")).toBe(true);
    // Fallen gelassene Punkte blockieren keinen Platz.
    const dropped = items.map((item, index) => (index === 0 ? { ...item, status: "dropped" as const } : item));
    expect(hasDayCapacity(dropped, "2026-09-24")).toBe(true);
    expect(FOCUS_LIMITS.maxPerDay).toBe(3);
  });

  it("übersetzt Status ehrlich statt positiv umzudeuten", () => {
    expect(focusStatusLabel("active")).toBe("aktiv");
    expect(focusStatusLabel("moved")).toBe("verschoben");
    expect(focusStatusLabel("dropped")).toBe("fallen gelassen");
  });
});

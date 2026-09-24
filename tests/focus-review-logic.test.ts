import { describe, expect, it } from "vitest";

import {
  FOCUS_LIMITS,
  evaluateFocusDay,
  buildWeeklyReview,
  isoWeekStart,
  selectReflectionPrompts,
  buildFocusResult,
  parseFocusPrompt,
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

describe("focus day evaluation (Sprint 233)", () => {
  const day = "2026-09-24";
  function item(title: string, status: "active" | "done" | "moved" | "dropped"): FocusItemInput {
    return { day, title, status };
  }
  type FocusItemInput = { day: string; title: string; status: "active" | "done" | "moved" | "dropped" };

  it("leerer Tag ist gültig und kein Versäumnis", () => {
    const verdict = evaluateFocusDay([], day);
    expect(verdict.state).toBe("empty");
    expect(verdict.headline).toContain("Kein Fokus");
    expect(verdict.observations[0]).toContain("kein Versäumnis");
  });

  it("offene, teilweise und abgeschlossene Tage werden ehrlich benannt", () => {
    expect(evaluateFocusDay([createFocusItem(item("Punkt A", "active"))], day).state).toBe("open");
    const mixed = [
      createFocusItem(item("Punkt A", "done")),
      createFocusItem(item("Punkt B", "active")),
      createFocusItem(item("Punkt C", "active")),
    ];
    const verdict = evaluateFocusDay(mixed, day);
    expect(verdict.state).toBe("partially-done");
    expect(verdict.observations.some((line) => line.includes("1 von 3"))).toBe(true);
    const allDone = [
      createFocusItem(item("Punkt A", "done")),
      createFocusItem(item("Punkt B", "done")),
      createFocusItem(item("Punkt C", "moved")),
    ];
    expect(evaluateFocusDay(allDone, day).state).toBe("done");
  });

  it("Verschieben und Fallen lassen bleiben sichtbar", () => {
    const items = [
      createFocusItem(item("Punkt A", "moved")),
      createFocusItem(item("Punkt B", "dropped")),
      createFocusItem(item("Punkt C", "active")),
    ];
    const verdict = evaluateFocusDay(items, day);
    expect(verdict.observations.some((line) => line.includes("1 Punkt(e) verschoben"))).toBe(true);
    expect(verdict.observations.some((line) => line.includes("1 Punkt(e) fallen"))).toBe(true);
  });

  it("Übererfüllung wird sichtbar statt versteckt", () => {
    const items = [1, 2, 3, 4].map((n) => createFocusItem(item(`Punkt ${n}`, "done")));
    const verdict = evaluateFocusDay(items, day);
    expect(verdict.state).toBe("overtime");
    expect(verdict.observations[0]).toContain("mehr als das Tageslimit");
  });

  it("andere Tage fließen nicht in die Bewertung ein", () => {
    const items = [createFocusItem({ ...item("Punkt A", "active"), day: "2026-09-25" })];
    expect(evaluateFocusDay(items, day).state).toBe("empty");
  });
});

describe("weekly review (Sprint 234)", () => {
  const weekStart = "2026-09-21"; // Montag

  it("ermittelt den ISO-Montag der Woche", () => {
    expect(isoWeekStart(new Date(2026, 8, 24, 10, 0).getTime())).toBe("2026-09-21"); // Donnerstag
    expect(isoWeekStart(new Date(2026, 8, 20, 10, 0).getTime())).toBe("2026-09-14"); // Sonntag gehört noch zur alten Woche
  });

  it("leere Woche bleibt ein echter Leerzustand mit Start-Hinweis", () => {
    const review = buildWeeklyReview([], weekStart);
    expect(review.headline).toBe("Leere Woche");
    expect(review.observations.some((line) => line.includes("1–3 Punkten"))).toBe(true);
    expect(review.counts.daysWithFocus).toBe(0);
  });

  it("zählt die Woche ehrlich und gibt keine Note", () => {
    const items = [
      createFocusItem({ day: "2026-09-21", title: "Montag A", status: "done" }),
      createFocusItem({ day: "2026-09-22", title: "Dienstag B", status: "done" }),
      createFocusItem({ day: "2026-09-22", title: "Dienstag C", status: "moved" }),
      createFocusItem({ day: "2026-09-25", title: "Freitag D", status: "dropped" }),
      createFocusItem({ day: "2026-09-26", title: "Samstag offen", status: "active" }),
    ];
    const review = buildWeeklyReview(items, weekStart);
    expect(review.counts.total).toBe(5);
    expect(review.counts.done).toBe(2);
    expect(review.counts.daysWithFocus).toBe(4);
    expect(review.observations.some((line) => line.includes("40 %") && line.includes("keine Note"))).toBe(true);
  });

  it("Fokus nur an einem Tag wird als Kalender-Beobachtung benannt", () => {
    const items = [createFocusItem({ day: "2026-09-23", title: "Einziger Punkt", status: "done" })];
    const review = buildWeeklyReview(items, weekStart);
    expect(review.observations.some((line) => line.includes("reaktiv"))).toBe(true);
  });

  it("Punkte außerhalb der Woche fließen nicht ein", () => {
    const items = [
      createFocusItem({ day: "2026-09-20", title: "Sonntag alte Woche", status: "done" }),
      createFocusItem({ day: "2026-09-28", title: "Montag nächste Woche", status: "done" }),
    ];
    const review = buildWeeklyReview(items, weekStart);
    expect(review.counts.total).toBe(0);
    expect(review.headline).toBe("Leere Woche");
  });

  it("lehnt ungültige Wochenstart-Tage ab", () => {
    expect(() => buildWeeklyReview([], "21.09.2026")).toThrow("ISO-Tag");
  });
});

describe("reflection prompts (Sprint 235)", () => {
  const weekStart = "2026-09-21";

  it("leere Woche bekommt Start-Hilfe statt Vorwürfen", () => {
    const prompts = selectReflectionPrompts(buildWeeklyReview([], weekStart));
    expect(prompts).toHaveLength(2);
    expect(prompts[0].question).toContain("eine Punkt");
    expect(prompts[1].rationale).toContain("Kalender-Problem");
  });

  it("viele Verschiebungen fragen nach der Punktgröße, nicht nach Willenskraft", () => {
    const items = [1, 2, 3].map((n) => createFocusItem({ day: `2026-09-2${n}`, title: `Punkt ${n}`, status: "moved" }));
    const prompts = selectReflectionPrompts(buildWeeklyReview(items, weekStart));
    const overcommit = prompts.find((prompt) => prompt.id === "overcommitment");
    expect(overcommit?.rationale).toContain("Überverpflichtung");
  });

  it("starke Woche fragt nach der wiederholbaren Bedingung", () => {
    const items = [1, 2, 3].map((n) => createFocusItem({ day: `2026-09-2${n}`, title: `Punkt ${n}`, status: "done" }));
    const prompts = selectReflectionPrompts(buildWeeklyReview(items, weekStart));
    expect(prompts.some((prompt) => prompt.id === "sustain")).toBe(true);
  });

  it("offene Punkte erben nicht stillschweigend, sondern über eine Frage", () => {
    const items = [createFocusItem({ day: "2026-09-25", title: "Offener Punkt", status: "active" })];
    const prompts = selectReflectionPrompts(buildWeeklyReview(items, weekStart));
    expect(prompts.some((prompt) => prompt.id === "open-rest" && prompt.rationale.includes("Entscheidung"))).toBe(true);
  });

  it("gibt nie mehr als zwei Fragen und keine vorgefertigten Antworten", () => {
    const items = [
      createFocusItem({ day: "2026-09-21", title: "Punkt A mit echtem Titel", status: "moved" }),
      createFocusItem({ day: "2026-09-22", title: "Punkt B mit echtem Titel", status: "moved" }),
      createFocusItem({ day: "2026-09-23", title: "Punkt C mit echtem Titel", status: "dropped" }),
      createFocusItem({ day: "2026-09-24", title: "Punkt D mit echtem Titel", status: "dropped" }),
      createFocusItem({ day: "2026-09-25", title: "Punkt E mit echtem Titel", status: "active" }),
    ];
    const prompts = selectReflectionPrompts(buildWeeklyReview(items, weekStart));
    expect(prompts.length).toBeLessThanOrEqual(2);
    expect(prompts.every((prompt) => prompt.question.endsWith("?"))).toBe(true);
  });

  it("ruhige Woche: offene Punkte zuerst, dann eine ehrliche Standardfrage", () => {
    const items = [
      createFocusItem({ day: "2026-09-22", title: "Punkt A", status: "done" }),
      createFocusItem({ day: "2026-09-23", title: "Punkt B", status: "active" }),
    ];
    const prompts = selectReflectionPrompts(buildWeeklyReview(items, weekStart));
    expect(prompts).toHaveLength(2);
    expect(prompts[0].id).toBe("open-rest");
    expect(prompts[1].id).toBe("default-honest");
  });
});

describe("focus prompt parsing (Sprint 236)", () => {
  it("leerer und unklarer Prompt endet sicher", () => {
    expect(parseFocusPrompt("").actions).toEqual(["list"]);
    expect(parseFocusPrompt("hm?").actions).toEqual(["day"]);
  });

  it("parst neue Fokus-Punkte mit Tag und Notiz", () => {
    const command = parseFocusPrompt("Plane Fokus: LinkedIn-Post finalisieren; Notiz: Kernaussage zuerst", () => new Date(2026, 8, 24, 9, 0).getTime());
    expect(command.actions).toContain("add");
    expect(command.newFocus).not.toBeNull();
    expect(command.newFocus?.title).toBe("LinkedIn-Post finalisieren");
    expect(command.newFocus?.note).toBe("Kernaussage zuerst");
    expect(command.newFocus?.day).toBe("2026-09-24");
    expect(validateFocusItem({ day: command.newFocus!.day!, title: command.newFocus!.title }).valid).toBe(true);
  });

  it("erkennt relative und absolute Tage", () => {
    const now = () => new Date(2026, 8, 24, 12, 0).getTime(); // Donnerstag
    expect(parseFocusPrompt("Fokus heute", now).day).toBe("2026-09-24");
    expect(parseFocusPrompt("Fokus morgen", now).day).toBe("2026-09-25");
    expect(parseFocusPrompt("Fokus am Montag", now).day).toBe("2026-09-28");
    expect(parseFocusPrompt("Rückblick für 2026-09-21", now).day).toBe("2026-09-21");
  });

  it("verneinte Aufträge werden nie ausführend", () => {
    const command = parseFocusPrompt("Zeig den Status, aber nicht erledigen");
    expect(command.actions).toEqual(["day"]);
    expect(command.newFocus).toBeNull();
    expect(parseFocusPrompt("Status, aber nicht löschen").actions).toEqual(["day"]);
  });

  it("erkennt Aktionen und Namensbezüge", () => {
    expect(parseFocusPrompt('Erledige "Post finalisieren"').actions).toContain("complete");
    expect(parseFocusPrompt('Verschiebe "Post finalisieren"').actions).toContain("move");
    expect(parseFocusPrompt('Streiche "Post finalisieren"').actions).toContain("drop");
    expect(parseFocusPrompt("Wochenrückblick").actions).toContain("review");
    expect(parseFocusPrompt('Erledige "Post finalisieren"').titleQuery).toBe("Post finalisieren");
  });
});

describe("focus honest result builder (Sprint 237)", () => {
  const now = () => new Date(2026, 8, 24, 12, 0).getTime();
  const itemA = createFocusItem({ day: "2026-09-24", title: "Post finalisieren" }, now);
  const itemB = createFocusItem({ day: "2026-09-24", title: "Post überarbeiten" }, () => now() + 5);

  it("listet ehrlich inklusive echtem Leerzustand", () => {
    const result = buildFocusResult({ actions: ["list"], titleQuery: null, day: null, newFocus: null }, [], now);
    expect(result.lines[0]).toContain("leere Zustand ist echt");
  });

  it("bereitet neue Punkte vor und meldet volle Tage", () => {
    const items = [1, 2, 3].map((n) => createFocusItem({ day: "2026-09-25", title: `Punkt ${n} am Tag` }, now));
    const prepared = buildFocusResult({ actions: ["add"], titleQuery: null, day: "2026-09-25", newFocus: { title: "Vierter Punkt", day: "2026-09-25", note: null } }, items, now);
    expect(prepared.lines[0]).toContain("voll");
    expect(prepared.lines[0]).toContain("max. 3 Punkte");
    const free = buildFocusResult({ actions: ["add"], titleQuery: null, day: "2026-09-26", newFocus: { title: "Vierter Punkt", day: "2026-09-26", note: null } }, items, now);
    expect(free.lines[0]).toContain("vorbereitet");
    expect(free.lines[0]).toContain("Bestätigung");
  });

  it("erledigen und streichen bleiben Freigabe-Anfragen", () => {
    const complete = buildFocusResult(parseFocusPrompt('Erledige "Post finalisieren"', now), [itemA, itemB], now);
    expect(complete.lines.some((line) => line.includes("erledigt markieren") && line.includes("Bestätigung"))).toBe(true);
    const drop = buildFocusResult(parseFocusPrompt('Streiche "Post finalisieren"', now), [itemA, itemB], now);
    expect(drop.lines.some((line) => line.includes("endgültig"))).toBe(true);
  });

  it("benennt uneindeutige Titel statt zu raten", () => {
    const result = buildFocusResult(parseFocusPrompt('Erledige "Post"', now), [itemA, itemB], now);
    expect(result.lines.some((line) => line.includes("Uneindeutig"))).toBe(true);
    expect(result.headline).toBe("Fokus & Rückblick");
  });

  it("Wochenrückblick enthält Beobachtungen und genau zwei Fragen", () => {
    const result = buildFocusResult(parseFocusPrompt("Wochenrückblick", now), [itemA], now);
    expect(result.headline).toBe("Wochenrückblick");
    expect(result.lines.filter((line) => line.startsWith("Frage:"))).toHaveLength(2);
    expect(result.lines.some((line) => line.includes("2026-09-21"))).toBe(true);
    expect(result.disclaimer).toContain("keine automatische Ausführung");
  });

  it("Tages-Anfrage zeigt die ehrliche Tages-Bewertung", () => {
    const result = buildFocusResult({ actions: ["day"], titleQuery: null, day: "2026-09-24", newFocus: null }, [itemA], now);
    expect(result.lines[0]).toContain("2026-09-24");
    expect(result.lines.some((line) => line.startsWith("• "))).toBe(true);
  });
});

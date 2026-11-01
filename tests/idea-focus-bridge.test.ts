import { describe, expect, it } from "vitest";

import { createFocusItem } from "../lib/focus-review-logic";
import { createIdeaItem } from "../lib/idea-inbox-logic";
import { annotateTriagePlantability, checkPlantVerdict } from "../lib/idea-focus-bridge";

const DAY = 86_400_000;
const now = () => 30 * DAY;

describe("idea focus bridge (Sprint 250)", () => {
  it("erkennt pflanzbare Ideen mit heutigem Tag", () => {
    const idea = createIdeaItem({ title: "Rückblick bis Freitag vorbereiten", source: "rückblick" }, () => 10 * DAY);
    const verdict = checkPlantVerdict(idea, [], null, now);
    expect(verdict.plantable).toBe(true);
    if (verdict.plantable) {
      expect(verdict.day).toBe("1970-01-31");
      expect(verdict.detail).toContain("Fokus-Tab");
    }
  });

  it("lehnt vollem Fokus-Tag ehrlich ab", () => {
    const idea = createIdeaItem({ title: "Zusätzliche Verpflichtung", source: "chat" }, () => 10 * DAY);
    const focus = [1, 2, 3].map((n) => createFocusItem({ day: "1970-01-31", title: `Punkt ${n}` }));
    const verdict = checkPlantVerdict(idea, focus, "1970-01-31", now);
    expect(verdict.plantable).toBe(false);
    if (!verdict.plantable) expect(verdict.reason).toContain("voll");
  });

  it("kürzt zu lange Ideen-Titel ehrlich statt abzulehnen", () => {
    const longTitle = "Sehr ".repeat(24) + "lange Idee";
    const idea = createIdeaItem({ title: longTitle, source: "chat" }, () => 10 * DAY);
    const verdict = checkPlantVerdict(idea, [], null, now);
    expect(verdict.plantable).toBe(true);
    if (verdict.plantable) expect(verdict.draftTitle.endsWith("…")).toBe(true);
  });

  it("annotiert nur Pflanzen-Vorschläge des Triage-Plans", () => {
    const plantable = createIdeaItem({ title: "Pflanzbare Idee", source: "chat" }, () => 10 * DAY);
    const watch = createIdeaItem({ title: "Frische Idee", source: "chat" }, () => 29 * DAY);
    const plan = {
      suggestions: [
        { ideaId: plantable.id, kind: "plant" as const },
        { ideaId: watch.id, kind: "watch" as const },
      ],
    };
    const verdicts = annotateTriagePlantability(plan, [plantable, watch], [], now);
    expect(verdicts.size).toBe(1);
    expect(verdicts.get(plantable.id)?.plantable).toBe(true);
  });
});

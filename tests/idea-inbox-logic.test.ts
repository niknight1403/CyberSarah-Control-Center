import { describe, expect, it } from "vitest";

import {
  IDEA_LIMITS,
  countInboxOpen,
  createIdeaItem,
  hasInboxCapacity,
  describeIdeaAge,
  describeInboxAges,
  ideaStatusLabel,
  validateIdeaItem,
} from "../lib/idea-inbox-logic";

describe("idea inbox core domain (Sprint 242)", () => {
  it("erzeugt normalisierte Ideen mit Quelle und Status", () => {
    const idea = createIdeaItem({ title: "  HARA-Demo als Video-Serie  ", note: " kurz & roh ", source: " spontan " }, () => 2_000);
    expect(idea.id).toMatch(/^idea-/);
    expect(idea.title).toBe("HARA-Demo als Video-Serie");
    expect(idea.note).toBe("kurz & roh");
    expect(idea.source).toBe("spontan");
    expect(idea.status).toBe("inbox");
    expect(idea.capturedAt).toBe(2_000);
  });

  it("validiert Titel, Notiz, Quelle und Status ehrlich", () => {
    expect(validateIdeaItem({ title: "x", source: "chat" }).valid).toBe(false);
    expect(validateIdeaItem({ title: "Gültige Idee", note: "y".repeat(500), source: "chat" }).valid).toBe(false);
    expect(validateIdeaItem({ title: "Gültige Idee" }).valid).toBe(false);
    expect(validateIdeaItem({ title: "Gültige Idee", source: "chat", status: "sonstiges" as never }).valid).toBe(false);
    expect(validateIdeaItem({ title: "Gültige Idee", source: "chat" }).valid).toBe(true);
  });

  it("klemmt die offene Inbox bewusst bei 30 Ideen", () => {
    const items = Array.from({ length: 30 }, (_, i) => createIdeaItem({ title: `Idee ${i}`, source: "spontan" }, () => 1_000 + i));
    expect(countInboxOpen(items)).toBe(30);
    expect(hasInboxCapacity(items)).toBe(false);
    const oneKept = items.map((item, index) => (index === 0 ? { ...item, status: "kept" as const } : item));
    expect(hasInboxCapacity(oneKept)).toBe(true);
    expect(IDEA_LIMITS.maxInboxOpen).toBe(30);
  });

  it("übersetzt Status ehrlich statt romantisch umzudeuten", () => {
    expect(ideaStatusLabel("inbox")).toBe("im Eingang");
    expect(ideaStatusLabel("planted")).toBe("gepflanzt");
    expect(ideaStatusLabel("dropped")).toBe("fallen gelassen");
  });
});

describe("idea aging (Sprint 243)", () => {
  const DAY = 86_400_000;

  it("frische Ideen werden nicht zur Eile gedrängt", () => {
    const idea = createIdeaItem({ title: "Neue Idee", source: "chat" }, () => 10 * DAY);
    const view = describeIdeaAge(idea, () => 10 * DAY + 12 * 3_600_000);
    expect(view.age).toBe("fresh");
    expect(view.observation).toContain("legitim");
  });

  it("vergilbende Ideen bekommen Tage und sanfte Triage-Aufforderung", () => {
    const idea = createIdeaItem({ title: "Ältere Idee", source: "spontan" }, () => 0);
    const view = describeIdeaAge(idea, () => 7 * DAY);
    expect(view.age).toBe("aging");
    expect(view.daysInInbox).toBe(7);
    expect(view.observation).toContain("Triage");
  });

  it("verwelkende Ideen bekommen die ehrliche Fallenlassen-Frage", () => {
    const idea = createIdeaItem({ title: "Uralte Idee", source: "rückblick" }, () => 0);
    const view = describeIdeaAge(idea, () => 21 * DAY);
    expect(view.age).toBe("withering");
    expect(view.observation).toContain("Fallen lassen wäre ehrlicher");
  });

  it("statistik über den Stapel bleibt bei entschiedenen Ideen ehrlich", () => {
    const now = () => 30 * DAY;
    const items = [
      createIdeaItem({ title: "Frische Idee", source: "chat" }, () => 29 * DAY),
      createIdeaItem({ title: "Vergilbte Idee", source: "chat" }, () => 20 * DAY),
      createIdeaItem({ title: "Verwelkende Idee", source: "chat" }, () => 5 * DAY),
      createIdeaItem({ title: "Behaltene Idee", source: "chat", status: "kept" }, () => 0),
    ];
    const stats = describeInboxAges(items, now);
    expect(stats.openTotal).toBe(3);
    expect(stats.fresh).toBe(1);
    expect(stats.aging).toBe(1);
    expect(stats.withering).toBe(1);
  });
});

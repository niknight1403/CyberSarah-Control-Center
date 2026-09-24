import { describe, expect, it } from "vitest";

import {
  IDEA_LIMITS,
  countInboxOpen,
  createIdeaItem,
  hasInboxCapacity,
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

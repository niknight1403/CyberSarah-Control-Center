import { describe, expect, it } from "vitest";
import { isNearDuplicateContent } from "../lib/content-dedupe-logic";

describe("content suggestion deduplication", () => {
  it("detects exact repeats despite punctuation and casing", () => {
    expect(isNearDuplicateContent(
      { topic: "KI im Vertrieb", content: "Wie KI den Vertrieb verändert: Automatisiere wiederkehrende Aufgaben und gewinne mehr Zeit für Kunden." },
      { topic: "KI im Vertrieb", content: "WIE KI DEN VERTRIEB VERÄNDERT Automatisiere wiederkehrende Aufgaben und gewinne mehr Zeit für Kunden!" },
    )).toBe(true);
  });

  it("detects lightly reworded repeats on the same topic", () => {
    expect(isNearDuplicateContent(
      { topic: "Content Automatisierung", content: "Content Automatisierung spart Teams viel Zeit. Plane Beiträge zentral, erstelle Varianten und messe anschließend Reichweite, Klicks und qualifizierte Leads." },
      { topic: "Content Automatisierung", content: "Automatisierung von Content spart Teams viel Zeit. Plane Beiträge zentral, erstelle Varianten und miss danach Reichweite, Klicks und qualifizierte Leads." },
    )).toBe(true);
  });

  it("allows a genuinely different angle", () => {
    expect(isNearDuplicateContent(
      { topic: "Content Automatisierung", content: "Ein Redaktionskalender organisiert Themen, Verantwortliche und Veröffentlichungstermine über mehrere Kanäle hinweg." },
      { topic: "Content Automatisierung", content: "Ein gutes Onboarding verkürzt die Zeit bis zum ersten Erfolg und senkt die Abbruchquote neuer Nutzer." },
    )).toBe(false);
  });

  it("does not compare short drafts", () => {
    expect(isNearDuplicateContent({ content: "Hallo" }, { content: "Hallo" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { IDEA_LIMITS, deriveIdeaFromDraft, validateIdeaItem } from "../lib/idea-inbox-logic";

/**
 * Sprint 349 — Regression: Ideen aus der autonomen Draft-Engine liessen sich
 * im Ideen-Tab nicht freigeben.
 *
 * Ursache: Die Freigabe reichte die Entwurfs-Notiz roh als Ideen-Titel durch
 * (Limit 140 Zeichen) und Notiz + Begruendung roh als Notiz (Limit 400).
 * Beides liegt bei realistischen Entwuerfen darueber — die Freigabe scheiterte,
 * ohne dass die Fehlermeldung sichtbar wurde.
 */

const LONG_NOTE =
  "Baue einen Wochenrueckblick als In-App-Karte, die Umsatz, offene Entwuerfe und vergilbende Ideen in einem Screen zusammenfasst und direkt in die Triage verlinkt.";
const LONG_RATIONALE =
  "Der Rueckblick ersetzt drei einzelne Tabs am Montagmorgen und macht liegengebliebene Entscheidungen sichtbar, ohne neue Datenquellen zu brauchen. Er nutzt ausschliesslich lokale Stores, braucht kein neues Backend und ist damit in unter zwei Wochen umsetzbar; danach laesst er sich um Trends und Wochenvergleiche erweitern.";

describe("alte Freigabe-Pfade scheiterten an den Inbox-Limits", () => {
  it("lange Notiz als Titel ist ungueltig", () => {
    const legacy = validateIdeaItem({ title: LONG_NOTE, note: "", source: "autonom" });
    expect(legacy.valid).toBe(false);
    if (!legacy.valid) expect(legacy.reason).toContain("Titel");
  });

  it("Notiz plus Begruendung sprengt das Notiz-Limit", () => {
    const merged = `${LONG_NOTE} — ${LONG_RATIONALE}`;
    expect(merged.length).toBeGreaterThan(IDEA_LIMITS.note.max);
    expect(validateIdeaItem({ title: LONG_NOTE.slice(0, 120), note: merged, source: "autonom" }).valid).toBe(false);
  });
});

describe("deriveIdeaFromDraft", () => {
  it("macht aus einem realistischen Entwurf eine gueltige Inbox-Idee", () => {
    const derived = deriveIdeaFromDraft({ note: LONG_NOTE, rationale: LONG_RATIONALE });
    expect(derived.valid).toBe(true);
    if (!derived.valid) return;
    expect(derived.title.length).toBeLessThanOrEqual(IDEA_LIMITS.title.max);
    expect(derived.note.length).toBeLessThanOrEqual(IDEA_LIMITS.note.max);
    expect(validateIdeaItem({ title: derived.title, note: derived.note, source: "autonom" }).valid).toBe(true);
    expect(derived.note).toContain("Warum:");
  });

  it("nimmt den ersten Satz als Titel statt des ganzen Absatzes", () => {
    const derived = deriveIdeaFromDraft({ note: "Wochenrueckblick-Karte bauen. Sie ersetzt drei Tabs am Montag." });
    expect(derived.valid).toBe(true);
    if (derived.valid) expect(derived.title).toBe("Wochenrueckblick-Karte bauen.");
  });

  it("behaelt kurze Notizen unveraendert als Titel", () => {
    const derived = deriveIdeaFromDraft({ note: "Podcast mit Kundenstimmen" });
    expect(derived.valid).toBe(true);
    if (derived.valid) {
      expect(derived.title).toBe("Podcast mit Kundenstimmen");
      expect(derived.note).toBe("Podcast mit Kundenstimmen");
    }
  });

  it("nutzt den Entwurfs-Titel, wenn die Engine einen mitliefert", () => {
    const derived = deriveIdeaFromDraft({ title: "Wochenrueckblick", note: LONG_NOTE, rationale: LONG_RATIONALE });
    expect(derived.valid).toBe(true);
    if (derived.valid) expect(derived.title).toBe("Wochenrueckblick");
  });

  it("kuerzt auch einen einzigen ueberlangen Satz auf das Limit", () => {
    const derived = deriveIdeaFromDraft({ note: "x".repeat(900) });
    expect(derived.valid).toBe(true);
    if (derived.valid) {
      expect(derived.title.length).toBeLessThanOrEqual(IDEA_LIMITS.title.max);
      expect(derived.title.endsWith("…")).toBe(true);
      expect(derived.note.length).toBeLessThanOrEqual(IDEA_LIMITS.note.max);
    }
  });

  it("lehnt einen leeren Entwurf ehrlich ab", () => {
    const derived = deriveIdeaFromDraft({ note: "   " });
    expect(derived.valid).toBe(false);
    if (!derived.valid) expect(derived.reason).toContain("keine Idee");
  });

  it("funktioniert ohne Begruendung", () => {
    const derived = deriveIdeaFromDraft({ note: LONG_NOTE });
    expect(derived.valid).toBe(true);
    if (derived.valid) expect(derived.note).toBe(derived.note.trim());
  });
});

import { describe, expect, it } from "vitest";

import {
  DECISION_LIMITS,
  countOpenDecisions,
  applyReviewVerdict,
  buildReviewVerdict,
  createDecisionItem,
  decisionStatusLabel,
  findDueForReview,
  hasOpenCapacity,
  isIsoDay,
  validateDecisionItem,
} from "../lib/decision-log-logic";

describe("decision log core domain (Sprint 252)", () => {
  const now = () => new Date(2026, 8, 24, 12, 0).getTime();

  it("erzeugt normalisierte Entscheidungen mit prüfbarer Erwartung", () => {
    const decision = createDecisionItem(
      { title: "  Preis für Pro um 20% erhöht  ", context: " Marge zu dünn ", expectation: "Umsatz pro Kunde steigt um 10–15% bis Ende Q4", reviewBy: "2026-12-31" },
      now,
    );
    expect(decision.id).toMatch(/^decision-/);
    expect(decision.title).toBe("Preis für Pro um 20% erhöht");
    expect(decision.status).toBe("open");
    expect(decision.reviewNote).toBeNull();
  });

  it("verlangt prüfbare Erwartungen und Nachprüf-Tage", () => {
    expect(validateDecisionItem({ title: "Neue Strategie", expectation: "geht gut", reviewBy: "2026-10-01" }).valid).toBe(false);
    expect(validateDecisionItem({ title: "Neue Strategie", expectation: "Konversion steigt um 5 Punkte bis 2026-12-31", reviewBy: "38.10.2026" }).valid).toBe(false);
    expect(validateDecisionItem({ title: "kurz", expectation: "Konversion steigt um 5 Punkte bis 2026-12-31", reviewBy: "2026-10-01" }).valid).toBe(false);
    expect(validateDecisionItem({ title: "Preis um 20% erhöht", expectation: "Konversion steigt um 5 Punkte bis 2026-12-31", reviewBy: "2026-10-01" }).valid).toBe(true);
  });

  it("erkennt gültige ISO-Tage und lehnt Mischformen ab", () => {
    expect(isIsoDay("2026-02-28")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("24.09.2026")).toBe(false);
  });

  it("begrenzt offene Entscheidungen bewusst", () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      createDecisionItem({ title: `Entscheidung ${i} mit Titel`, expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-10-01" }, now),
    );
    expect(countOpenDecisions(items)).toBe(40);
    expect(hasOpenCapacity(items)).toBe(false);
    const reviewed = items.map((item, index) => (index === 0 ? { ...item, status: "confirmed" as const } : item));
    expect(hasOpenCapacity(reviewed)).toBe(true);
    expect(DECISION_LIMITS.maxOpen).toBe(40);
  });

  it("findet fällige Nachprüfungen ehrlich — auch für heute", () => {
    const dueToday = createDecisionItem({ title: "Heute fällige Entscheidung", expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-09-24" }, now);
    const future = createDecisionItem({ title: "Zukünftige Entscheidung", expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-12-31" }, now);
    expect(findDueForReview([dueToday, future], now).map((item) => item.id)).toEqual([dueToday.id]);
    expect(decisionStatusLabel("confirmed")).toBe("Erwartung bestätigt");
    expect(decisionStatusLabel("wrong")).toBe("Erwartung nicht eingetroffen");
  });
});

describe("review verdict (Sprint 253)", () => {
  const now = () => new Date(2026, 8, 24, 12, 0).getTime();
  const base = () => createDecisionItem({ title: "Preis für Pro um 20% erhöht", expectation: "Umsatz pro Kunde steigt um 10% bis Q4", reviewBy: "2026-09-24" }, now);

  it("bestätigt klare positive Berichte mit Datum", () => {
    const verdict = buildReviewVerdict(base(), "Umsatz pro Kunde erreicht +12%, Erwartung erfüllt", now);
    expect(verdict.status).toBe("confirmed");
    expect(verdict.rationale).toContain("2026-09-24");
  });

  it("dokumentiert Verfehlen als Ergebnis, nicht als Vorwurf", () => {
    const verdict = buildReviewVerdict(base(), "Umsatz gesunken, Kunden weniger — Verfehlt", now);
    expect(verdict.status).toBe("wrong");
    expect(verdict.rationale).toContain("kein Vorwurf");
  });

  it("unentscheidbare Berichte werden als unklar benannt, nie geraten", () => {
    const verdict = buildReviewVerdict(base(), "Mal besser, mal schlechter, schwer zu sagen", now);
    expect(verdict.status).toBe("unclear");
    expect(verdict.rationale).toContain("nicht geraten");
  });

  it("leere Berichte bleiben ehrlich unklar statt still zu bestätigen", () => {
    const verdict = buildReviewVerdict(base(), "  ", now);
    expect(verdict.status).toBe("unclear");
    expect(verdict.rationale).toContain("aus Stille");
  });

  it("applyReviewVerdict setzt Status und Bericht, ändert aber die Ursprungs-Formulierung nicht", () => {
    const decision = base();
    const reviewed = applyReviewVerdict(decision, { status: "wrong", rationale: "r" }, "Umsatz nicht gestiegen", now);
    expect(reviewed.status).toBe("wrong");
    expect(reviewed.reviewNote).toBe("Umsatz nicht gestiegen");
    expect(reviewed.expectation).toBe(decision.expectation);
    expect(reviewed.decidedAt).toBe(decision.decidedAt);
  });
});

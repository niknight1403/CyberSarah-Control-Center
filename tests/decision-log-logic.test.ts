import { describe, expect, it } from "vitest";

import {
  DECISION_LIMITS,
  countOpenDecisions,
  applyReviewVerdict,
  buildDecisionResult,
  buildReviewVerdict,
  describeSupersedeChain,
  supersedeDecision,
  createDecisionItem,
  decisionStatusLabel,
  findDueForReview,
  parseDecisionPrompt,
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

describe("supersede with visible history (Sprint 254)", () => {
  const now = () => new Date(2026, 8, 24, 12, 0).getTime();
  const base = () => createDecisionItem({ title: "Preis für Pro um 20% erhöht", expectation: "Umsatz pro Kunde steigt um 10% bis Q4", reviewBy: "2026-12-31" }, now);

  it("ersetzt sichtbar und bewahrt die alte Formulierung unverändert", () => {
    const decision = base();
    const outcome = supersedeDecision(
      [decision],
      decision.id,
      { title: "Preis für Pro um 15% erhöht", expectation: "Umsatz pro Kunde steigt um 8% bis Q4, Churn unter 5%", reviewBy: "2027-01-31" },
      now,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const superseded = outcome.items.find((item) => item.id === decision.id)!;
    expect(superseded.status).toBe("superseded");
    expect(superseded.expectation).toBe(decision.expectation);
    expect(superseded.reviewNote).toContain("unverändert");
    expect(outcome.items.some((item) => item.status === "open")).toBe(true);
    expect(outcome.note).toContain("bleibt als ersetzt lesbar");
  });

  it("lehnt doppeltes Ersetzen als Verlaufslüge ab", () => {
    const decision = base();
    const first = supersedeDecision([decision], decision.id, { title: "Nachfolge-Entscheidung A", expectation: "Erwartung mit Termin und Zahl", reviewBy: "2026-12-31" }, now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = supersedeDecision(first.items, decision.id, { title: "Nachfolge-Entscheidung B", expectation: "Erwartung mit Termin und Zahl", reviewBy: "2026-12-31" }, now);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toContain("Verlaufslüge");
  });

  it("lehnt unbekannte Ziele und invalide Nachfolger ehrlich ab", () => {
    const decision = base();
    const missing = supersedeDecision([decision], "gibtsnicht", { title: "Nachfolge-Entscheidung", expectation: "Erwartung mit Termin und Zahl", reviewBy: "2026-12-31" }, now);
    expect(missing.ok).toBe(false);
    const invalid = supersedeDecision([decision], decision.id, { title: "Nachfolge-Entscheidung", expectation: "geht gut", reviewBy: "2026-12-31" }, now);
    expect(invalid.ok).toBe(false);
  });

  it("beschreibt die Ersetzungs-Kette vollständig", () => {
    const first = base();
    const outcome = supersedeDecision([first], first.id, { title: "Zweite Entscheidung im Mai", expectation: "Erwartung mit Termin und Zahl", reviewBy: "2026-12-31" }, now);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const chain = describeSupersedeChain(outcome.items, first.id);
    expect(chain).toHaveLength(2);
    expect(chain[0]).toContain("ersetzt");
    expect(chain[1]).toContain("Zweite Entscheidung im Mai");
  });
});

describe("decision prompt parsing (Sprint 255)", () => {
  it("parst neue Entscheidungen mit Erwartung und Nachprüf-Tag", () => {
    const command = parseDecisionPrompt("Entscheidung: Preis für Pro um 20% erhöht; Kontext: Marge zu dünn; Erwartung: Umsatz pro Kunde +10% bis Q4; Nachprüfen: 2026-12-31");
    expect(command.actions).toContain("add");
    expect(command.newDecision?.title).toBe("Preis für Pro um 20% erhöht");
    expect(command.newDecision?.expectation).toBe("Umsatz pro Kunde +10% bis Q4");
    expect(command.newDecision?.reviewBy).toBe("2026-12-31");
    expect(command.newDecision?.context).toBe("Marge zu dünn");
  });

  it("ohne Erwartung bleibt es ehrlich unvollständig", () => {
    const command = parseDecisionPrompt("Entscheidung: Irgendwas neues probieren");
    expect(command.newDecision).toBeNull();
  });

  it("parst Nachprüfungs-Berichte mit Ergebnis", () => {
    const command = parseDecisionPrompt('Nachprüfen für "Preis für Pro"; Ergebnis: Umsatz gestiegen, Erwartung erfüllt');
    expect(command.actions).toContain("review");
    expect(command.outcomeReport).toBe("Umsatz gestiegen, Erwartung erfüllt");
    expect(command.titleQuery).toBe("Preis für Pro");
  });

  it("verneinte Aufträge werden nie ausführend", () => {
    expect(parseDecisionPrompt("Status zeigen, aber nicht nachprüfen").actions).toEqual(["status"]);
    expect(parseDecisionPrompt("Übersicht, nichts ersetzen").actions).toEqual(["status"]);
  });

  it("leerer und unklarer Text enden sicher", () => {
    expect(parseDecisionPrompt("").actions).toEqual(["list"]);
    expect(parseDecisionPrompt("hm?").actions).toEqual(["status"]);
  });
});

describe("decision honest result builder (Sprint 256)", () => {
  const now = () => new Date(2026, 8, 24, 12, 0).getTime();
  const price = () => createDecisionItem({ title: "Preis für Pro um 20% erhöht", expectation: "Umsatz pro Kunde +10% bis Q4", reviewBy: "2026-12-31" }, now);

  it("listet ehrlich inklusive Fälligkeiten ohne Mahnton", () => {
    const due = createDecisionItem({ title: "Fällige alte Entscheidung", expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-09-01" }, now);
    const result = buildDecisionResult({ actions: ["status"], titleQuery: null, newDecision: null, outcomeReport: null }, [price(), due], now);
    expect(result.lines.some((line) => line.includes("1 zur Nachprüfung fällig"))).toBe(true);
    expect(result.lines.some((line) => line.includes("nicht verurteilt"))).toBe(true);
  });

  it("Neuzugang ohne Nachprüf-Tag wird ehrlich abgelehnt", () => {
    const command: import("../lib/decision-log-logic").DecisionPromptCommand = {
      actions: ["add"],
      titleQuery: null,
      newDecision: { title: "Preis für Pro um 20% erhöht", context: null, expectation: "Umsatz +10% bis Q4", reviewBy: null },
      outcomeReport: null,
    };
    const result = buildDecisionResult(command, [], now);
    expect(result.lines[0]).toContain("Nachprüf-Tag");
  });

  it("Nachprüfung mit Bericht bleibt Freigabe-Anfrage", () => {
    const parsed = parseDecisionPrompt('Nachprüfen für "Preis für Pro"; Ergebnis: Umsatz gestiegen, Erwartung erfüllt');
    const result = buildDecisionResult(parsed, [price()], now);
    expect(result.headline).toBe("Nachprüfung");
    expect(result.lines.some((line) => line.includes("Bestätigung"))).toBe(true);
  });

  it("bereits nachgeprüfte Entscheidungen werden vor doppelter Prüfung bewahrt", () => {
    const reviewed = { ...price(), status: "confirmed" as const, reviewNote: "Umsatz +12%", updatedAt: now() + 1 };
    const parsed = parseDecisionPrompt('Nachprüfen für "Preis für Pro"; Ergebnis: nochmal gestiegen');
    const result = buildDecisionResult(parsed, [reviewed], now);
    expect(result.lines.some((line) => line.includes("doppelt Prüfen wäre Schönung"))).toBe(true);
  });

  it("uneindeutige Titel werden benannt, nie geraten", () => {
    const other = createDecisionItem({ title: "Preis für Max um 20% erhöht", expectation: "Andere messbare Erwartung mit Termin", reviewBy: "2026-12-31" }, now);
    const parsed = parseDecisionPrompt('Nachprüfen für "Preis"');
    const result = buildDecisionResult(parsed, [price(), other], now);
    expect(result.lines.some((line) => line.includes("Uneindeutig"))).toBe(true);
  });

  it("Disclaimer verbietet rückwirkendes Schönen", () => {
    const result = buildDecisionResult({ actions: ["list"], titleQuery: null, newDecision: null, outcomeReport: null }, [], now);
    expect(result.disclaimer).toContain("rückwirkend geschönt");
    expect(result.headline).toBe("Entscheidungs-Journal");
  });
});

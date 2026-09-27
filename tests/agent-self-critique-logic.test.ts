import { describe, it, expect } from "vitest";
import {
  evaluateCriterion,
  evaluateSolutionAgainstCriteria,
  AcceptanceCriterion,
} from "../lib/agent-self-critique-logic";

describe("Sprint 365 — Selbst-Kritik-Schritt", () => {
  const criteria: AcceptanceCriterion[] = [
    {
      id: "c1",
      description: "Enthält Testergebnisse",
      required: true,
      keywords: ["test", "pass"],
    },
    {
      id: "c2",
      description: "Enthält Commit-SHA im Hex-Format",
      required: true,
      pattern: "[0-9a-f]{7,40}",
    },
    {
      id: "c3",
      description: "Bietet ausführliche Zusammenfassung",
      required: false,
      minWordCount: 10,
    },
  ];

  it("bewertet einzelne Kriterien präzise nach Schlüsselwörtern und Mustern", () => {
    const validText = "Alle tests passed erfolgreich im Commit 9fe3a02 mit hoher Qualität.";
    const eval1 = evaluateCriterion(criteria[0], validText);
    const eval2 = evaluateCriterion(criteria[1], validText);

    expect(eval1.satisfied).toBe(true);
    expect(eval2.satisfied).toBe(true);
  });

  it("erkennt fehlende Schlüsselwörter und verfehlte Muster", () => {
    const incompleteText = "Das Modul wurde geschrieben.";
    const eval1 = evaluateCriterion(criteria[0], incompleteText);
    const eval2 = evaluateCriterion(criteria[1], incompleteText);

    expect(eval1.satisfied).toBe(false);
    expect(eval1.missingAspects[0]).toContain("Fehlende Schlüsselwörter");
    expect(eval2.satisfied).toBe(false);
  });

  it("erstellt vollständige Selbstkritik-Analyse mit Nachbesserungshinweisen", () => {
    const solution = "Tests passed. Commit 6dcd453.";
    const result = evaluateSolutionAgainstCriteria("Batch 16 ausführen", solution, criteria);

    expect(result.isPassed).toBe(false); // c3 minWordCount verfehlt (nur 4 Wörter)
    expect(result.mandatoryPassed).toBe(true);
    expect(result.retryRecommended).toBe(true);
    expect(result.refinedPromptInstruction).toContain("Wortanzahl zu gering");
  });

  it("akzeptiert vollständige Lösungen ohne Nachbesserungs-Bedarf", () => {
    const goodSolution =
      "Alle 25 vitest tests passed vollständig und grün. Der Git Commit 6dcd453 wurde erfolgreich auf main gepusht.";
    const result = evaluateSolutionAgainstCriteria("Batch 16 ausführen", goodSolution, criteria);

    expect(result.isPassed).toBe(true);
    expect(result.overallScore).toBe(100);
    expect(result.retryRecommended).toBe(false);
    expect(result.refinedPromptInstruction).toBeUndefined();
  });

  it("geht angemessen mit leeren Eingaben um", () => {
    const result = evaluateSolutionAgainstCriteria("Test Task", "", criteria);

    expect(result.isPassed).toBe(false);
    expect(result.overallScore).toBe(0);
    expect(result.retryRecommended).toBe(true);
  });
});

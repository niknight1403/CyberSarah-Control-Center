import { describe, expect, it } from "vitest";
import { contentEvidenceReview } from "../lib/content-evidence-review";
import { validateDraftPayload } from "../lib/draft-engine-logic";
describe("Sprint 31: content evidence review before draft approval", () => {
  it("flags false-scarcity, unverifiable discounts and profit promises", () => {
    const flags = contentEvidenceReview("NUR HEUTE -20% Rabatt und garantiertes Einkommen: 500 € Umsatz", undefined);
    expect(flags.some(f => f.includes("Rabattbeleg"))).toBe(true);
    expect(flags.some(f => f.includes("Fristnachweis"))).toBe(true);
    expect(flags.some(f => f.includes("Umsatzangaben"))).toBe(true);
  });
  it("requires advertisement review for affiliate copy without disclosure", () => {
    expect(contentEvidenceReview("Dieser Partnerlink ist toll", undefined)
      .some(f => f.includes("Affiliate"))).toBe(true);
    expect(contentEvidenceReview("Dieser Partnerlink ist toll", "Werbung · Affiliate")
      .some(f => f.includes("Affiliate"))).toBe(false);
  });
  it("does not manufacture alerts for a neutral factual draft", () => {
    expect(contentEvidenceReview("Praxisnaher Leitfaden fuer KI-Aufgaben", "Information")).toEqual([]);
  });
  it("preserves review flags in the existing typed content draft queue", () => {
    const result = validateDraftPayload("content", {
      personaId: "sarah", platform: "instagram", topic: "Rabattaktionen",
      content: "Nur heute -20% Rabatt, hier findest du mehr.", disclosure: "Werbung",
    });
    expect(result.valid).toBe(true);
    if (result.valid && "reviewFlags" in result.payload) {
      expect(result.payload.reviewFlags?.length).toBeGreaterThan(0);
    } else {
      throw new Error("review flags must be preserved for human approval");
    }
  });
});

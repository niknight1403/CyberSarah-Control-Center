import { describe, expect, it } from "vitest";
import { validateSerieI } from "../lib/serie-i-validation-logic";

describe("Sprint 373 — Serie-I-Abschluss Validation Logic", () => {
  it("validiert erfolgreich alle 10 Sprints von Serie I (364–373) mit 100% grün", () => {
    const summary = validateSerieI();

    expect(summary.totalSprints).toBe(10);
    expect(summary.passedSprintsCount).toBe(10);
    expect(summary.allPassed).toBe(true);
    expect(summary.scorePercent).toBe(100);
    expect(summary.formattedReport).toContain("10/10 Sprints grün (100%)");
    expect(summary.formattedReport).toContain("BEREIT FÜR PRODUKTION");
  });
});

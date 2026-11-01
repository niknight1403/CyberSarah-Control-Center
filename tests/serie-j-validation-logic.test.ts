import { describe, expect, it } from "vitest";
import {
  EXPECTED_SERIE_J_SPRINTS,
  SerieJSprintStatus,
  validateSerieJ,
} from "../lib/serie-j-validation-logic";

describe("Serie J Validation Logic (Sprint 383)", () => {
  it("contains all 10 expected Serie J sprints in catalog", () => {
    expect(EXPECTED_SERIE_J_SPRINTS).toHaveLength(10);
    expect(EXPECTED_SERIE_J_SPRINTS[0].number).toBe(374);
    expect(EXPECTED_SERIE_J_SPRINTS[9].number).toBe(383);
  });

  it("validates all 10 sprints of Serie J successfully", () => {
    const sprints: SerieJSprintStatus[] = EXPECTED_SERIE_J_SPRINTS.map((e) => ({
      sprintNumber: e.number,
      name: e.name,
      module: e.module,
      passed: true,
      notes: `Sprint ${e.number} passed`,
    }));

    const result = validateSerieJ({
      sprints,
      totalTests: 2335,
      testFiles: 305,
      typecheckClean: true,
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.passedSprintsCount).toBe(10);
    expect(result.summary).toContain("Serie J (Sprints 374–383) vollständig grün");
  });

  it("detects missing or failing sprints in Serie J validation", () => {
    const incompleteSprints: SerieJSprintStatus[] = EXPECTED_SERIE_J_SPRINTS.slice(0, 8).map((e) => ({
      sprintNumber: e.number,
      name: e.name,
      module: e.module,
      passed: true,
      notes: `Sprint ${e.number} passed`,
    }));

    const result = validateSerieJ({
      sprints: incompleteSprints,
      totalTests: 2330,
      testFiles: 300,
      typecheckClean: true,
    });

    expect(result.passed).toBe(false);
    expect(result.passedSprintsCount).toBe(8);
  });
});

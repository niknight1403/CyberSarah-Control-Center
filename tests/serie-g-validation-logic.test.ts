import { describe, expect, it } from "vitest";
import {
  SERIE_G_SPRINT_DEFS,
  generateSerieGMarkdownReport,
  validateSerieGMobilePolitur,
} from "../lib/serie-g-validation-logic";

describe("Sprint 353 — Serie G Validation Logic", () => {
  it("enthält genau 10 Sprint-Definitionen (344–353)", () => {
    expect(SERIE_G_SPRINT_DEFS.length).toBe(10);
    expect(SERIE_G_SPRINT_DEFS[0].sprintNumber).toBe(344);
    expect(SERIE_G_SPRINT_DEFS[9].sprintNumber).toBe(353);
  });

  it("validiert Serie G als abgeschlossen wenn alle Module und Tests vorhanden sind", () => {
    const allPaths = SERIE_G_SPRINT_DEFS.flatMap((def) => [def.modulePath, def.testPath]);

    const result = validateSerieGMobilePolitur(allPaths);
    expect(result.isSerieGComplete).toBe(true);
    expect(result.passedCount).toBe(10);
    expect(result.failedCount).toBe(0);
    expect(result.summary).toContain("vollständig grün");
  });

  it("meldet Unvollständigkeit wenn Pfade fehlen", () => {
    // Es fehlt z. B. lib/predictive-back-logic.ts
    const partialPaths = SERIE_G_SPRINT_DEFS.slice(0, 5).flatMap((def) => [def.modulePath, def.testPath]);

    const result = validateSerieGMobilePolitur(partialPaths);
    expect(result.isSerieGComplete).toBe(false);
    expect(result.passedCount).toBe(5);
    expect(result.failedCount).toBe(5);
    expect(result.summary).toContain("unvollständig");
  });

  it("generiert sauberen Markdown-Abschlussbericht", () => {
    const allPaths = SERIE_G_SPRINT_DEFS.flatMap((def) => [def.modulePath, def.testPath]);
    const validation = validateSerieGMobilePolitur(allPaths);

    const report = generateSerieGMarkdownReport(validation, "abc1234", {
      totalTests: 2017,
      totalFiles: 255,
    });

    expect(report).toContain("# Serie G Abschlussbericht: Mobile-App-Politur (Sprints 344–353)");
    expect(report).toContain("abc1234");
    expect(report).toContain("2017 Tests grün");
    expect(report).toContain("Predictive Back");
    expect(report).toContain("Serie H");
  });
});

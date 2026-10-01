import { describe, expect, it } from "vitest";
import {
  calculateTestGrowth,
  evaluateHundredSprintBilanz,
  SeriesCompletionStatus,
} from "../lib/hundred-sprint-bilanz-logic";

describe("100-Sprint-Bilanz Logic (Sprint 382)", () => {
  it("calculates test growth correctly", () => {
    const growth = calculateTestGrowth(1560, 2335, 305);
    expect(growth.initial).toBe(1560);
    expect(growth.current).toBe(2335);
    expect(growth.added).toBe(775);
    expect(growth.testFiles).toBe(305);
  });

  it("evaluates complete 100-sprint balance sheet", () => {
    const seriesList: SeriesCompletionStatus[] = [
      { seriesKey: "A", name: "Dev-Loop", sprintRange: "284–293", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "B", name: "Produkt-Politur", sprintRange: "294–303", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "C", name: "Medien v2", sprintRange: "304–313", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "D", name: "Umsatz-Reihe", sprintRange: "314–323", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "E", name: "Zuverlässigkeit", sprintRange: "324–333", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "F", name: "Integrationen", sprintRange: "334–343", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "G", name: "Mobile-Politur", sprintRange: "344–353", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "H", name: "Admin & Ops", sprintRange: "354–363", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "I", name: "Agent-Intelligenz", sprintRange: "364–373", sprintsCount: 10, completedCount: 10, completed: true },
      { seriesKey: "J", name: "Finale", sprintRange: "374–383", sprintsCount: 10, completedCount: 10, completed: true },
    ];

    const report = evaluateHundredSprintBilanz({
      startSprint: 284,
      endSprint: 383,
      completedSprintsCount: 100,
      initialTestCount: 1560,
      currentTestCount: 2335,
      testFilesCount: 305,
      series: seriesList,
      unreachedGoals: [
        "Keine echten Zahlungen bisher; Maschinerie ist live verifiziert.",
      ],
      ownerHandoffs: [
        "APK-Gerätetest auf physischem Android-Gerät.",
        "Play-Store-Einreichung.",
      ],
    });

    expect(report.totalSprintsPlanned).toBe(100);
    expect(report.totalSprintsCompleted).toBe(100);
    expect(report.completionPercentage).toBe(100);
    expect(report.seriesCoverage.completedSeries).toBe(10);
    expect(report.seriesCoverage.allSeriesPassed).toBe(true);
    expect(report.isMissionSuccess).toBe(true);
    expect(report.ownerHandoffs.length).toBe(2);
  });
});

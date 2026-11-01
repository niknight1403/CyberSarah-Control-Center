/**
 * 100-Sprint-Bilanz Logik (rein, testbar) — Sprint 382.
 *
 * Berechnet Statistiken der 100-Sprint-Mission (284–383),
 * prüft Serien-Abdeckung (Serie A bis Serie J) und klassifiziert
 * ehrliche Owner-Handoffs und Lücken.
 */

export interface SeriesCompletionStatus {
  seriesKey: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
  name: string;
  sprintRange: string; // e.g. "284–293"
  sprintsCount: number;
  completedCount: number;
  completed: boolean;
}

export interface HundredSprintBilanzInput {
  startSprint: number; // 284
  endSprint: number; // 383
  completedSprintsCount: number;
  initialTestCount: number; // 1560
  currentTestCount: number;
  testFilesCount: number;
  series: SeriesCompletionStatus[];
  unreachedGoals: string[];
  ownerHandoffs: string[];
}

export interface HundredSprintBilanzReport {
  totalSprintsPlanned: number; // 100
  totalSprintsCompleted: number; // e.g. 100 or 98
  completionPercentage: number;
  testGrowth: {
    initial: number;
    current: number;
    added: number;
    testFiles: number;
  };
  seriesCoverage: {
    totalSeries: number;
    completedSeries: number;
    allSeriesPassed: boolean;
  };
  unreachedGoalsCount: number;
  unreachedGoals: string[];
  ownerHandoffs: string[];
  isMissionSuccess: boolean;
}

export function calculateTestGrowth(
  initial: number,
  current: number,
  testFiles: number,
): { initial: number; current: number; added: number; testFiles: number } {
  return {
    initial,
    current,
    added: Math.max(0, current - initial),
    testFiles,
  };
}

export function evaluateHundredSprintBilanz(
  input: HundredSprintBilanzInput,
): HundredSprintBilanzReport {
  const totalSprintsPlanned = input.endSprint - input.startSprint + 1; // 100
  const completionPercentage = Math.round(
    (input.completedSprintsCount / totalSprintsPlanned) * 100,
  );

  const testGrowth = calculateTestGrowth(
    input.initialTestCount,
    input.currentTestCount,
    input.testFilesCount,
  );

  const completedSeriesCount = input.series.filter((s) => s.completed).length;
  const allSeriesPassed = completedSeriesCount === input.series.length;

  const isMissionSuccess =
    completionPercentage >= 98 &&
    allSeriesPassed &&
    testGrowth.added > 500;

  return {
    totalSprintsPlanned,
    totalSprintsCompleted: input.completedSprintsCount,
    completionPercentage,
    testGrowth,
    seriesCoverage: {
      totalSeries: input.series.length,
      completedSeries: completedSeriesCount,
      allSeriesPassed,
    },
    unreachedGoalsCount: input.unreachedGoals.length,
    unreachedGoals: input.unreachedGoals,
    ownerHandoffs: input.ownerHandoffs,
    isMissionSuccess,
  };
}

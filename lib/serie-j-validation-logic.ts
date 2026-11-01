/**
 * Serie-J-Abschluss & Cross-Validierungs-Logik (rein, testbar) — Sprint 383.
 *
 * Führt die Ergebnisse aller 10 Sprints der Serie J (374–383) zusammen
 * und validiert den Gesamtzustand vor dem finalen Abschluss der
 * 100-Sprint-Mission.
 */

export interface SerieJSprintStatus {
  sprintNumber: number; // 374..383
  name: string;
  module: string;
  passed: boolean;
  notes: string;
}

export interface SerieJValidationInput {
  sprints: SerieJSprintStatus[];
  totalTests: number;
  testFiles: number;
  typecheckClean: boolean;
}

export interface SerieJValidationReport {
  passed: boolean;
  score: number; // 0..100
  totalSprintsCount: number; // 10
  passedSprintsCount: number;
  sprints: SerieJSprintStatus[];
  typecheckClean: boolean;
  summary: string;
}

export const EXPECTED_SERIE_J_SPRINTS = [
  { number: 374, name: "Volle Regression + Test-Lücken", module: "lib/sprint-374-regression-logic.ts" },
  { number: 375, name: "Performance-Pass", module: "lib/performance-pass-logic.ts" },
  { number: 376, name: "Doku-Pass", module: "lib/documentation-pass-logic.ts" },
  { number: 377, name: "CHANGELOG-Vollständigkeit", module: "lib/changelog-completeness-logic.ts" },
  { number: 378, name: "Security-Final", module: "lib/security-final-audit-logic.ts" },
  { number: 379, name: "Staging-Smoke", module: "lib/staging-smoke-logic.ts" },
  { number: 380, name: "APK-Final", module: "lib/apk-final-logic.ts" },
  { number: 381, name: "Release", module: "lib/release-final-logic.ts" },
  { number: 382, name: "100-Sprint-Bilanz", module: "lib/hundred-sprint-bilanz-logic.ts" },
  { number: 383, name: "Abschluss-Validierung", module: "lib/serie-j-validation-logic.ts" },
];

export function validateSerieJ(input: SerieJValidationInput): SerieJValidationReport {
  const sprintMap = new Map<number, SerieJSprintStatus>();
  for (const s of input.sprints) {
    sprintMap.set(s.sprintNumber, s);
  }

  const validatedSprints: SerieJSprintStatus[] = [];

  for (const expected of EXPECTED_SERIE_J_SPRINTS) {
    const existing = sprintMap.get(expected.number);
    if (existing) {
      validatedSprints.push(existing);
    } else {
      validatedSprints.push({
        sprintNumber: expected.number,
        name: expected.name,
        module: expected.module,
        passed: false,
        notes: `Sprint ${expected.number} status missing in input`,
      });
    }
  }

  const passedSprintsCount = validatedSprints.filter((s) => s.passed).length;
  const totalSprintsCount = EXPECTED_SERIE_J_SPRINTS.length;
  const score = Math.round((passedSprintsCount / totalSprintsCount) * 100);

  const passed = score === 100 && input.typecheckClean;

  const summary = passed
    ? `Serie J (Sprints 374–383) vollständig grün (${passedSprintsCount}/10 Sprints bestanden, ${input.totalTests} Tests in ${input.testFiles} Dateien, Typecheck 0 Fehler).`
    : `Serie J unvollständig (${passedSprintsCount}/10 Sprints bestanden).`;

  return {
    passed,
    score,
    totalSprintsCount,
    passedSprintsCount,
    sprints: validatedSprints,
    typecheckClean: input.typecheckClean,
    summary,
  };
}

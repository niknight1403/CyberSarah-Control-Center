import { describe, expect, it } from "vitest";
import {
  parseChangelogSprintCoverage,
  auditChangelogCompleteness,
  verifyChangelogAppendIntegrity,
} from "../lib/changelog-completeness-logic";

describe("Sprint 377: CHANGELOG-Vollständigkeit (changelog-completeness-logic)", () => {
  const sampleChangelog = `# Changelog

## 26.09.2026 — Sprints 374–378: Serie J: Finale
- Sprint 374: Volle Regression
- Sprint 375: Performance
- Sprint 376: Doku
- Sprint 377: Changelog
- Sprint 378: Security

## 25.09.2026 — Sprints 284–288: Serie A
- Erstes Release
`;

  it("parst Sprint-Bereiche und Titel aus CHANGELOG.md", () => {
    const coverage = parseChangelogSprintCoverage(sampleChangelog);
    expect(coverage.coveredSprints).toContain(374);
    expect(coverage.coveredSprints).toContain(378);
    expect(coverage.coveredSprints).toContain(284);
    expect(coverage.coveredRanges.length).toBe(2);
  });

  it("auditiert Vollständigkeit der Sprints im CHANGELOG", () => {
    const result = auditChangelogCompleteness(sampleChangelog, { start: 374, end: 378 });
    expect(result.isComplete).toBe(true);
    expect(result.missingSprints).toEqual([]);
    expect(result.hasValidFormat).toBe(true);

    const incompleteResult = auditChangelogCompleteness(sampleChangelog, { start: 280, end: 378 });
    expect(incompleteResult.isComplete).toBe(false);
    expect(incompleteResult.missingSprints).toContain(280);
  });

  it("verifiziert, dass Althistorie bei Aktualisierungen erhalten bleibt (Append-Integrität)", () => {
    const oldChangelog = `# Changelog\n\n## 25.09.2026 — Sprints 284–288\n- Test`;
    const newChangelog = `# Changelog\n\n## 26.09.2026 — Sprints 374–378\n- NEU\n\n## 25.09.2026 — Sprints 284–288\n- Test`;

    const integrityOk = verifyChangelogAppendIntegrity(oldChangelog, newChangelog);
    expect(integrityOk.isIntegrityPreserved).toBe(true);

    const truncatedChangelog = `# Changelog\n\n## 26.09.2026 — Sprints 374–378\n- NEU`;
    const integrityFailed = verifyChangelogAppendIntegrity(oldChangelog, truncatedChangelog);
    expect(integrityFailed.isIntegrityPreserved).toBe(false);
  });
});

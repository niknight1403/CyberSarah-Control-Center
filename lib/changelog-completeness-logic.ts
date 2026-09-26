/**
 * Sprint 377: CHANGELOG-Vollständigkeit seit 284
 * Logic-Modul für Parsing, Abdeckungsprüfung und Struktur-Integritäts-Audit von CHANGELOG.md.
 */

export interface SprintRange {
  start: number;
  end: number;
}

export interface ChangelogSprintCoverage {
  coveredSprints: number[];
  coveredRanges: Array<{ start: number; end: number }>;
  entryTitles: string[];
}

export interface ChangelogAuditResult {
  isComplete: boolean;
  totalRequiredSprints: number;
  coveredSprintsCount: number;
  missingSprints: number[];
  hasValidFormat: boolean;
  warnings: string[];
}

/**
 * Parst CHANGELOG.md und extrahiert alle abgedeckten Sprint-Nummern und Abschnitte.
 */
export function parseChangelogSprintCoverage(changelogContent: string): ChangelogSprintCoverage {
  const coveredSprintsSet = new Set<number>();
  const coveredRanges: Array<{ start: number; end: number }> = [];
  const entryTitles: string[] = [];

  const lines = changelogContent.split("\n");

  for (const line of lines) {
    if (line.startsWith("## ")) {
      entryTitles.push(line.substring(3).trim());

      // Suche nach Sprint-Mustern wie "Sprints 284–288" oder "Sprint 374"
      const rangeMatch = /Sprints?\s+(\d+)(?:[–-](\d+))?/i.exec(line);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start;
        coveredRanges.push({ start, end });
        for (let s = start; s <= end; s++) {
          coveredSprintsSet.add(s);
        }
      }
    }
  }

  return {
    coveredSprints: Array.from(coveredSprintsSet).sort((a, b) => a - b),
    coveredRanges,
    entryTitles,
  };
}

/**
 * Überprüft, ob alle Sprints in einer geforderten Spanne im CHANGELOG enthalten sind.
 */
export function auditChangelogCompleteness(
  changelogContent: string,
  targetRange: SprintRange = { start: 284, end: 378 }
): ChangelogAuditResult {
  const coverage = parseChangelogSprintCoverage(changelogContent);
  const warnings: string[] = [];

  const totalRequired = targetRange.end - targetRange.start + 1;
  const missingSprints: number[] = [];

  for (let s = targetRange.start; s <= targetRange.end; s++) {
    if (!coverage.coveredSprints.includes(s)) {
      missingSprints.push(s);
    }
  }

  // Formatprüfungen
  const hasTitleHeader = changelogContent.includes("# Changelog");
  if (!hasTitleHeader) {
    warnings.push("Hauptüberschrift '# Changelog' fehlt.");
  }

  const isComplete = missingSprints.length === 0 && hasTitleHeader;

  return {
    isComplete,
    totalRequiredSprints: totalRequired,
    coveredSprintsCount: totalRequired - missingSprints.length,
    missingSprints,
    hasValidFormat: hasTitleHeader,
    warnings,
  };
}

/**
 * Prüft, ob neue Sektionen am ANFANG hinzugefügt wurden und keine historischen gelöscht wurden.
 */
export function verifyChangelogAppendIntegrity(
  previousContent: string,
  updatedContent: string
): { isIntegrityPreserved: boolean; reason?: string } {
  // Mindestens alle Zeilen des alten Inhalts müssen im neuen Inhalt enthalten sein
  const prevLines = previousContent.trim().split("\n").filter((l) => l.trim().length > 0);
  const updatedLines = updatedContent.trim().split("\n").filter((l) => l.trim().length > 0);

  if (updatedLines.length < prevLines.length) {
    return {
      isIntegrityPreserved: false,
      reason: `Zeilenanzahl verringert (${updatedLines.length} < ${prevLines.length}). Althistorie wurde möglicherweise gelöscht.`,
    };
  }

  // Prüfen, ob wesentliche Althistorien-Header erhalten sind
  for (const line of prevLines) {
    if (line.startsWith("## ")) {
      if (!updatedContent.includes(line)) {
        return {
          isIntegrityPreserved: false,
          reason: `Historische Überschrift '${line}' fehlt im aktualisierten CHANGELOG.`,
        };
      }
    }
  }

  return { isIntegrityPreserved: true };
}

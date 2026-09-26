import { describe, expect, it } from "vitest";
import {
  auditDocStructure,
  checkLinkIntegrity,
  calculateDocCoverageScore,
  DocFile,
} from "../lib/documentation-pass-logic";

describe("Sprint 376: Doku-Pass (documentation-pass-logic)", () => {
  it("auditiert die Struktur von Dokumentationsdateien auf Überschriften und Abschnitte", () => {
    const doc: DocFile = {
      path: "docs/TEST.md",
      title: "Test Doku",
      content: "# Test Doku\n\n## Einleitung\nDas ist ein Test.\n\n## Fazit\nFertig.",
    };

    const audit = auditDocStructure(doc, ["Einleitung", "Fazit"]);
    expect(audit.hasTitle).toBe(true);
    expect(audit.hasRequiredSections).toBe(true);
    expect(audit.wordCount).toBeGreaterThan(5);

    const auditMissing = auditDocStructure(doc, ["Architektur"]);
    expect(auditMissing.hasRequiredSections).toBe(false);
    expect(auditMissing.missingSections).toContain("Architektur");
  });

  it("prüft relative Markdown-Links auf Integrität", () => {
    const fileMap: Record<string, string> = {
      "README.md": "Siehe [Sprint Tracker](docs/SPRINT_TRACKER.md) und [Defekt](docs/BROKEN.md)",
      "docs/SPRINT_TRACKER.md": "# Tracker\n[Main](../README.md)",
    };

    const result = checkLinkIntegrity(fileMap);
    expect(result.totalLinksFound).toBe(3);
    expect(result.validLinksCount).toBe(2);
    expect(result.brokenLinksCount).toBe(1);
    expect(result.brokenLinks[0].targetPath).toBe("docs/BROKEN.md");
  });

  it("berechnet den Doku-Abdeckungsgrad für vorgegebene Sprint-Bereiche", () => {
    const docFiles: DocFile[] = [
      { path: "README.md", title: "README", content: "" },
      { path: "OPERATIONS.md", title: "OPS", content: "" },
      { path: "docs/SPRINTPLAN_284-383.md", title: "Plan", content: "" },
      { path: "docs/SPRINT_TRACKER.md", title: "Tracker", content: "" },
      { path: "docs/2026-09-24_SPRINTS_284-288_TEST.md", title: "284-288", content: "" },
      { path: "docs/2026-09-24_SPRINTS_289-293_TEST.md", title: "289-293", content: "" },
    ];

    const result = calculateDocCoverageScore(docFiles, { start: 284, end: 293 });
    expect(result.isRequiredDocsPresent).toBe(true);
    expect(result.docScorePercent).toBe(100);
    expect(result.missingSprintDokus).toEqual([]);
  });
});

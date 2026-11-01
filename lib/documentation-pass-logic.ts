/**
 * Sprint 376: Doku-Pass: README, OPERATIONS, Sprint-Dokus verlinkt und aktuell
 * Logic-Modul für Doku-Strukturaudits, Verlinkungsprüfung und Vollständigkeitsanalyse.
 */

export interface DocFile {
  path: string;
  title: string;
  content: string;
}

export interface DocStructureAudit {
  path: string;
  hasTitle: boolean;
  hasRequiredSections: boolean;
  missingSections: string[];
  wordCount: number;
}

export interface LinkIntegrityResult {
  totalLinksFound: number;
  validLinksCount: number;
  brokenLinksCount: number;
  brokenLinks: Array<{ sourceFile: string; linkText: string; targetPath: string }>;
}

export interface DocCoverageResult {
  docScorePercent: number;
  totalRequiredSprints: number;
  documentedSprintsCount: number;
  missingSprintDokus: number[];
  isRequiredDocsPresent: boolean;
}

const REQUIRED_CORE_DOCS = ["README.md", "OPERATIONS.md", "docs/SPRINTPLAN_284-383.md", "docs/SPRINT_TRACKER.md"];

/**
 * Auditiert die Struktur einzelner Dokumentationsdateien auf Überschriften und Pflichtabschnitte.
 */
export function auditDocStructure(
  doc: DocFile,
  requiredSections: string[] = []
): DocStructureAudit {
  const lines = doc.content.split("\n");
  const hasTitle = lines.some((l) => l.trim().startsWith("# "));
  const missingSections: string[] = [];

  for (const sec of requiredSections) {
    const regex = new RegExp(`^#+\\s+.*${sec}`, "i");
    if (!lines.some((l) => regex.test(l.trim()))) {
      missingSections.push(sec);
    }
  }

  const wordCount = doc.content.trim().split(/\s+/).filter(Boolean).length;

  return {
    path: doc.path,
    hasTitle,
    hasRequiredSections: missingSections.length === 0,
    missingSections,
    wordCount,
  };
}

/** Hilfsfunktion zum Normalisieren relativer Pfade mit .. und . */
function normalizePath(pathStr: string): string {
  const parts = pathStr.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
}

/**
 * Prüft die Integrität relativer Markdown-Links in einem Satz von Dokumenten.
 */
export function checkLinkIntegrity(fileMap: Record<string, string>): LinkIntegrityResult {
  let totalLinksFound = 0;
  let validLinksCount = 0;
  let brokenLinksCount = 0;
  const brokenLinks: Array<{ sourceFile: string; linkText: string; targetPath: string }> = [];

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const [sourceFile, content] of Object.entries(fileMap)) {
    let match: RegExpExecArray | null;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const linkText = match[1];
      let targetPath = match[2];

      // Anchor oder externe URLs ignorieren
      if (targetPath.startsWith("http://") || targetPath.startsWith("https://") || targetPath.startsWith("#")) {
        continue;
      }

      // Anchor vom Pfad trennen
      if (targetPath.includes("#")) {
        targetPath = targetPath.split("#")[0];
      }

      if (!targetPath) continue;

      totalLinksFound++;

      // Pfadauflösung relativ zum sourceFile
      let rawTarget = targetPath;
      if (!targetPath.startsWith("/")) {
        const sourceDir = sourceFile.includes("/") ? sourceFile.substring(0, sourceFile.lastIndexOf("/")) : "";
        rawTarget = sourceDir ? `${sourceDir}/${targetPath}` : targetPath;
      } else {
        rawTarget = targetPath.substring(1);
      }

      const resolvedTarget = normalizePath(rawTarget);

      if (fileMap[resolvedTarget] !== undefined) {
        validLinksCount++;
      } else {
        brokenLinksCount++;
        brokenLinks.push({
          sourceFile,
          linkText,
          targetPath: resolvedTarget,
        });
      }
    }
  }

  return {
    totalLinksFound,
    validLinksCount,
    brokenLinksCount,
    brokenLinks,
  };
}

/**
 * Berechnet den Doku-Abdeckungsgrad für geforderte Sprints (z. B. 284 bis 378).
 */
export function calculateDocCoverageScore(
  docFiles: DocFile[],
  sprintRange: { start: number; end: number }
): DocCoverageResult {
  const filePaths = docFiles.map((f) => f.path);
  const isRequiredDocsPresent = REQUIRED_CORE_DOCS.every((req) => filePaths.includes(req));

  const totalRequiredSprints = sprintRange.end - sprintRange.start + 1;
  const documentedSprints = new Set<number>();

  for (const doc of docFiles) {
    const match = /SPRINTS_(\d+)-(\d+)/.exec(doc.path);
    if (match) {
      const sStart = parseInt(match[1], 10);
      const sEnd = parseInt(match[2], 10);
      for (let s = sStart; s <= sEnd; s++) {
        if (s >= sprintRange.start && s <= sprintRange.end) {
          documentedSprints.add(s);
        }
      }
    }
  }

  const missingSprintDokus: number[] = [];
  for (let s = sprintRange.start; s <= sprintRange.end; s++) {
    if (!documentedSprints.has(s)) {
      missingSprintDokus.push(s);
    }
  }

  const documentedSprintsCount = documentedSprints.size;
  const docScorePercent = Math.round((documentedSprintsCount / totalRequiredSprints) * 100);

  return {
    docScorePercent,
    totalRequiredSprints,
    documentedSprintsCount,
    missingSprintDokus,
    isRequiredDocsPresent,
  };
}

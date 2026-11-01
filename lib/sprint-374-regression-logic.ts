/**
 * Sprint 374: Volle Regression + Test-Lücken schließen
 * Logic-Modul für Platzhalter-Switched-Audit, Abdeckungsprüfung kritischer Kernpfade
 * und automatisierte Selbst-Audits der Regressions-Gates.
 */

export interface CodeFile {
  path: string;
  content: string;
}

export interface PlaceholderFinding {
  filePath: string;
  line: number;
  token: string;
  context: string;
  severity: "high" | "medium" | "low";
}

export interface PlaceholderAuditResult {
  isClean: boolean;
  totalFilesScanned: number;
  totalFindings: number;
  findings: PlaceholderFinding[];
}

export interface TestResultItem {
  file: string;
  status: "passed" | "failed";
  area: "auth" | "billing" | "publishing" | "campaign" | "trpc" | "drafts" | "other";
}

export interface CorePathCoverageResult {
  totalTests: number;
  passCount: number;
  failCount: number;
  passRatePercent: number;
  coverageByArea: Record<string, { total: number; passed: number; percent: number }>;
  isFullyCovered: boolean;
}

export interface SuiteMeta {
  totalTests: number;
  totalFiles: number;
  failedTests: number;
  executionTimeMs: number;
}

export interface RegressionCheckResult {
  passed: boolean;
  score: number; // 0..100
  reasons: string[];
}

const PLACEHOLDER_PATTERNS = [
  { regex: /\b(TODO|FIXME)\b/i, token: "TODO/FIXME", severity: "medium" as const },
  { regex: /\bDUMMY_DATA\b/i, token: "DUMMY_DATA", severity: "high" as const },
  { regex: /\bMOCK_RESPONSE\b/i, token: "MOCK_RESPONSE", severity: "medium" as const },
  { regex: /\bPLACEHOLDER\b/i, token: "PLACEHOLDER", severity: "low" as const },
  { regex: /\bXXX_TEMP\b/i, token: "XXX_TEMP", severity: "high" as const },
];

/**
 * Durchsucht Code-Dateien nach Platzhalter-Tokens (TODO, FIXME, DUMMY_DATA etc.)
 */
export function auditPlaceholderFreedom(files: CodeFile[]): PlaceholderAuditResult {
  const findings: PlaceholderFinding[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.regex.test(lineText)) {
          findings.push({
            filePath: file.path,
            line: i + 1,
            token: pattern.token,
            context: lineText.trim(),
            severity: pattern.severity,
          });
        }
      }
    }
  }

  return {
    isClean: findings.length === 0,
    totalFilesScanned: files.length,
    totalFindings: findings.length,
    findings,
  };
}

/**
 * Analysiert Testergebnisse nach Kernbereichen (Auth, Billing, Publishing etc.)
 */
export function auditCorePathCoverage(testResults: TestResultItem[]): CorePathCoverageResult {
  const requiredAreas = ["auth", "billing", "publishing", "campaign", "trpc", "drafts"];
  const coverageByArea: Record<string, { total: number; passed: number; percent: number }> = {};

  for (const area of requiredAreas) {
    coverageByArea[area] = { total: 0, passed: 0, percent: 0 };
  }

  let passCount = 0;
  let failCount = 0;

  for (const item of testResults) {
    if (item.status === "passed") {
      passCount++;
    } else {
      failCount++;
    }

    if (!coverageByArea[item.area]) {
      coverageByArea[item.area] = { total: 0, passed: 0, percent: 0 };
    }

    coverageByArea[item.area].total++;
    if (item.status === "passed") {
      coverageByArea[item.area].passed++;
    }
  }

  for (const area of Object.keys(coverageByArea)) {
    const stats = coverageByArea[area];
    stats.percent = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
  }

  const isFullyCovered = requiredAreas.every(
    (area) => coverageByArea[area] && coverageByArea[area].total > 0 && coverageByArea[area].percent === 100
  );

  const totalTests = testResults.length;
  const passRatePercent = totalTests > 0 ? Math.round((passCount / totalTests) * 100) : 0;

  return {
    totalTests,
    passCount,
    failCount,
    passRatePercent,
    coverageByArea,
    isFullyCovered,
  };
}

/**
 * Evaluiert die Regressions-Gesundheit der gesamten Test-Suite
 */
export function runRegressionCheck(
  suiteMeta: SuiteMeta,
  minRequiredTests = 2000
): RegressionCheckResult {
  const reasons: string[] = [];
  let score = 100;

  if (suiteMeta.failedTests > 0) {
    score -= 50;
    reasons.push(`${suiteMeta.failedTests} Test(s) schlagen fehl.`);
  }

  if (suiteMeta.totalTests < minRequiredTests) {
    score -= 30;
    reasons.push(`Testanzahl (${suiteMeta.totalTests}) unter Mindestschwelle (${minRequiredTests}).`);
  }

  if (suiteMeta.executionTimeMs > 60000) {
    score -= 10;
    reasons.push(`Ausführungszeit (${Math.round(suiteMeta.executionTimeMs / 1000)}s) überschreitet 60s.`);
  }

  if (score < 0) score = 0;

  return {
    passed: score >= 80 && suiteMeta.failedTests === 0,
    score,
    reasons,
  };
}

/**
 * Sprint 287 — Dev-Agent: Test-Runner-Tool (vitest einzelner Datei, Ergebnis-Zusammenfassung).
 *
 * Führt gezielt vitest für einzelne Testdateien oder Filter-Muster aus
 * und parst deren Ausgaben zu strukturierten Ergebnis-Zusammenfassungen.
 * Pure, deterministische Logik.
 */

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResultItem {
  name: string;
  status: TestStatus;
  durationMs?: number;
  failureMessage?: string;
}

export interface TestRunSummary {
  testFile: string | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  isSuccess: boolean;
  results: TestResultItem[];
  rawSummaryLine?: string;
}

export function buildTestRunnerCommand(
  testFile?: string,
  pattern?: string
): { command: string; args: string[] } {
  const args = ["vitest", "run"];

  if (testFile && testFile.trim()) {
    args.push(testFile.trim());
  }

  if (pattern && pattern.trim()) {
    args.push("-t", pattern.trim());
  }

  return {
    command: "npx",
    args,
  };
}

export function parseVitestOutput(rawOutput: string, targetFile?: string | null): TestRunSummary {
  if (!rawOutput || !rawOutput.trim()) {
    return {
      testFile: targetFile || null,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      isSuccess: false,
      results: [],
      rawSummaryLine: "Keine Test-Ausgabe empfangen.",
    };
  }

  const lines = rawOutput.split("\n");
  const results: TestResultItem[] = [];

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  let rawSummaryLine: string | undefined;

  // Pattern matching vitest output lines like:
  // ✓ tests/foo.test.ts > suite > test name (12ms)
  // × tests/foo.test.ts > suite > failed test (5ms)
  //   ❯ suite > failed test
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes("Tests ") && (trimmed.includes("passed") || trimmed.includes("failed"))) {
      rawSummaryLine = trimmed;
      const passedMatch = trimmed.match(/(\d+)\s+passed/);
      if (passedMatch) passed = parseInt(passedMatch[1], 10);

      const failedMatch = trimmed.match(/(\d+)\s+failed/);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);

      const skippedMatch = trimmed.match(/(\d+)\s+skipped/);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
    }

    if (trimmed.includes("Duration")) {
      const durMatch = trimmed.match(/Duration\s+([\d.]+)(s|ms)/i);
      if (durMatch) {
        const val = parseFloat(durMatch[1]);
        durationMs = durMatch[2].toLowerCase() === "s" ? Math.round(val * 1000) : Math.round(val);
      }
    }

    // Individual test status lines
    if (trimmed.startsWith("✓ ") || trimmed.startsWith("PASS ")) {
      const testName = trimmed.replace(/^(✓|PASS)\s+/, "").trim();
      results.push({ name: testName, status: "passed" });
    } else if (trimmed.startsWith("× ") || trimmed.startsWith("FAIL ")) {
      const testName = trimmed.replace(/^(×|FAIL)\s+/, "").trim();
      results.push({ name: testName, status: "failed" });
    } else if (trimmed.startsWith("↓ ") || trimmed.startsWith("SKIP ")) {
      const testName = trimmed.replace(/^(↓|SKIP)\s+/, "").trim();
      results.push({ name: testName, status: "skipped" });
    }
  }

  const total = passed + failed + skipped || results.length;
  const isSuccess = failed === 0 && (passed > 0 || total === 0);

  return {
    testFile: targetFile || null,
    total,
    passed,
    failed,
    skipped,
    durationMs,
    isSuccess,
    results,
    rawSummaryLine,
  };
}

export function formatTestRunSummaryReport(summary: TestRunSummary): string {
  const parts = [];

  const fileLabel = summary.testFile ? ` in '${summary.testFile}'` : "";
  if (summary.isSuccess) {
    parts.push(`Test-Run erfolgreich${fileLabel}: ${summary.passed} bestanden (${summary.durationMs}ms).`);
  } else {
    parts.push(`Test-Run FEHLGESCHLAGEN${fileLabel}: ${summary.failed} fehlgeschlagen, ${summary.passed} bestanden (${summary.durationMs}ms).`);
  }

  if (summary.results.length > 0) {
    parts.push("\nDetails:");
    for (const res of summary.results) {
      const symbol = res.status === "passed" ? "✓" : res.status === "failed" ? "×" : "↓";
      parts.push(`${symbol} ${res.name}`);
    }
  }

  return parts.join("\n").trim();
}

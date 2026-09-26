import { describe, expect, it } from "vitest";
import {
  auditPlaceholderFreedom,
  auditCorePathCoverage,
  runRegressionCheck,
  CodeFile,
  TestResultItem,
  SuiteMeta,
} from "../lib/sprint-374-regression-logic";

describe("Sprint 374: Volle Regression & Test-Lücken (sprint-374-regression-logic)", () => {
  it("erkennt Platzhalter-Tokens in Code-Dateien und meldet saubere Dateien korrekt", () => {
    const cleanFiles: CodeFile[] = [
      { path: "app/index.tsx", content: "export default function App() { return <View />; }" },
      { path: "lib/auth.ts", content: "export function login() { return true; }" },
    ];

    const cleanResult = auditPlaceholderFreedom(cleanFiles);
    expect(cleanResult.isClean).toBe(true);
    expect(cleanResult.totalFindings).toBe(0);

    const dirtyFiles: CodeFile[] = [
      { path: "app/dirty.tsx", content: "// TODO: fix UI bug\nconst dummy = DUMMY_DATA;" },
    ];

    const dirtyResult = auditPlaceholderFreedom(dirtyFiles);
    expect(dirtyResult.isClean).toBe(false);
    expect(dirtyResult.totalFindings).toBe(2);
    expect(dirtyResult.findings[0].token).toBe("TODO/FIXME");
    expect(dirtyResult.findings[1].token).toBe("DUMMY_DATA");
  });

  it("prüft die Abdeckung kritischer Kernpfade auf 100% Pass-Rate", () => {
    const testResults: TestResultItem[] = [
      { file: "auth.test.ts", status: "passed", area: "auth" },
      { file: "billing.test.ts", status: "passed", area: "billing" },
      { file: "publishing.test.ts", status: "passed", area: "publishing" },
      { file: "campaign.test.ts", status: "passed", area: "campaign" },
      { file: "trpc.test.ts", status: "passed", area: "trpc" },
      { file: "drafts.test.ts", status: "passed", area: "drafts" },
    ];

    const result = auditCorePathCoverage(testResults);
    expect(result.isFullyCovered).toBe(true);
    expect(result.passRatePercent).toBe(100);
    expect(result.coverageByArea.auth.passed).toBe(1);
  });

  it("evaluiert die Regressions-Gesundheit der Gesamtsuite ehrlich", () => {
    const healthySuite: SuiteMeta = {
      totalTests: 2292,
      totalFiles: 296,
      failedTests: 0,
      executionTimeMs: 5000,
    };

    const healthyResult = runRegressionCheck(healthySuite);
    expect(healthyResult.passed).toBe(true);
    expect(healthyResult.score).toBe(100);
    expect(healthyResult.reasons).toEqual([]);

    const failingSuite: SuiteMeta = {
      totalTests: 1500,
      totalFiles: 100,
      failedTests: 2,
      executionTimeMs: 70000,
    };

    const failingResult = runRegressionCheck(failingSuite);
    expect(failingResult.passed).toBe(false);
    expect(failingResult.score).toBeLessThan(80);
    expect(failingResult.reasons.length).toBeGreaterThan(0);
  });
});

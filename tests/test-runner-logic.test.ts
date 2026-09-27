import { describe, expect, it } from "vitest";
import {
  buildTestRunnerCommand,
  formatTestRunSummaryReport,
  parseVitestOutput,
} from "../lib/test-runner-logic";

describe("test-runner-logic (Sprint 287)", () => {
  it("baut npx vitest Befehle korrekt mit Testdatei und Filter-Muster", () => {
    const cmd1 = buildTestRunnerCommand("tests/a.test.ts");
    expect(cmd1.command).toBe("npx");
    expect(cmd1.args).toEqual(["vitest", "run", "tests/a.test.ts"]);

    const cmd2 = buildTestRunnerCommand("tests/a.test.ts", "feature x");
    expect(cmd2.args).toEqual(["vitest", "run", "tests/a.test.ts", "-t", "feature x"]);
  });

  it("parst vitest Konsolenausgaben zu strukturierten TestRunSummary-Daten", () => {
    const rawOutput = `
 RUN  v5.0.0 /app/repo

 ✓ tests/a.test.ts > basic check (12ms)
 × tests/a.test.ts > failing check (5ms)

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Duration  250ms
`;

    const summary = parseVitestOutput(rawOutput, "tests/a.test.ts");
    expect(summary.testFile).toBe("tests/a.test.ts");
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.total).toBe(2);
    expect(summary.durationMs).toBe(250);
    expect(summary.isSuccess).toBe(false);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].status).toBe("passed");
    expect(summary.results[1].status).toBe("failed");
  });

  it("formatiert erfolgreiche Test-Ergebnisse verständlich", () => {
    const rawOutput = `
 ✓ tests/b.test.ts > ok (1ms)

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  1.2s
`;

    const summary = parseVitestOutput(rawOutput, "tests/b.test.ts");
    expect(summary.isSuccess).toBe(true);
    expect(summary.durationMs).toBe(1200);

    const report = formatTestRunSummaryReport(summary);
    expect(report).toContain("Test-Run erfolgreich in 'tests/b.test.ts'");
    expect(report).toContain("1 bestanden");
  });
});

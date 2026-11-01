import { describe, expect, it } from "vitest";
import {
  checkIterationLimit,
  createIterationTracker,
  getIterationLimitDocumentation,
  recordIterationStep,
  sanitizeIterationConfig,
} from "../lib/dev-agent-iteration-limit-logic";

describe("dev-agent-iteration-limit-logic (Sprint 288)", () => {
  it("sanitisiert benutzerdefinierte Iterations-Konfigurationen sicher", () => {
    const defaultConf = sanitizeIterationConfig();
    expect(defaultConf.maxIterations).toBe(8);
    expect(defaultConf.warningThreshold).toBe(6);

    const custom = sanitizeIterationConfig({ maxIterations: 12, warningThreshold: 10 });
    expect(custom.maxIterations).toBe(12);
    expect(custom.warningThreshold).toBe(10);

    const bounded = sanitizeIterationConfig({ maxIterations: 100, warningThreshold: 50 });
    expect(bounded.maxIterations).toBe(20); // max clamp 20
    expect(bounded.warningThreshold).toBe(20); // capped at max
  });

  it("verfolgt Iterationen und schlägt Warnung an der Schwelle an", () => {
    let tracker = createIterationTracker({ maxIterations: 5, warningThreshold: 3 });

    expect(checkIterationLimit(tracker).allowed).toBe(true);
    expect(checkIterationLimit(tracker).remaining).toBe(5);

    // Iteration 1
    let step = recordIterationStep(tracker, "read_repo_file", 1000);
    tracker = step.updatedTracker;
    expect(tracker.currentIteration).toBe(1);
    expect(step.warningMessage).toBeUndefined();

    // Iteration 2
    step = recordIterationStep(tracker, "write_repo_file", 2000);
    tracker = step.updatedTracker;

    // Iteration 3 (Warning threshold = 3)
    step = recordIterationStep(tracker, "git_status", 3000);
    tracker = step.updatedTracker;
    expect(step.warningMessage).toContain("Achtung: Werkzeug-Iteration 3 von max. 5");

    // Iteration 4
    step = recordIterationStep(tracker, "commit_changes", 4000);
    tracker = step.updatedTracker;

    // Iteration 5 (Max limit reached)
    step = recordIterationStep(tracker, "push_changes", 5000);
    tracker = step.updatedTracker;
    expect(checkIterationLimit(tracker).allowed).toBe(false);
    expect(checkIterationLimit(tracker).limitReason).toContain("Maximale Werkzeug-Iterationen (5) für diesen Task erreicht");
  });

  it("liefert ehrliche Dokumentation der Iterationsgrenzen", () => {
    const doc = getIterationLimitDocumentation();
    expect(doc).toContain("Standard-Limit:");
    expect(doc).toContain("Maximal 8 Werkzeug-Aufrufe");
    expect(doc).toContain("Schutz vor Endlosschleifen");
  });
});

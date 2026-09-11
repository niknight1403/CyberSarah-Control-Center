import { describe, expect, it } from "vitest";

import {
  detectSignatureLoop,
  evaluateConvergence,
  LOOP_LIMITS,
  nextLoopDirective,
  planRetryDelayMs,
  stepSignature,
} from "../lib/loop-engineering-logic";

describe("loop engineering", () => {
  it("builds stable, normalized step signatures", () => {
    expect(stepSignature({ kind: " Edit File ", target: "src/a.ts" })).toBe(
      stepSignature({ kind: "edit file", target: "SRC/A.TS" }),
    );
    expect(stepSignature({ kind: "run", summary: "npm test" })).toBe("run::npm test");
    expect(stepSignature({ kind: "a" })).not.toBe(stepSignature({ kind: "b" }));
  });

  it("detects repeated signatures only beyond the repeat limit", () => {
    const once = detectSignatureLoop(["a::x", "b::y", "c::z"]);
    expect(once.detected).toBe(false);

    const loop = detectSignatureLoop(["a::x", "b::y", "a::x", "c::z", "a::x"]);
    expect(loop.detected).toBe(true);
    expect(loop.repeatedSignature).toBe("a::x");
    expect(loop.occurrences).toBe(3);

    const stricter = detectSignatureLoop(["a::x", "a::x"], 2);
    expect(stricter.detected).toBe(true);
  });

  it("evaluates convergence over the progress window", () => {
    expect(evaluateConvergence([]).trend).toBe("insufficient-samples");
    expect(evaluateConvergence([0.5]).trend).toBe("insufficient-samples");

    const improving = evaluateConvergence([0.1, 0.2, 0.35, 0.5, 0.68, 0.82]);
    expect(improving.converged).toBe(false);
    expect(improving.stalled).toBe(false);
    expect(improving.trend).toBe("improving");

    const stalled = evaluateConvergence([0.4, 0.41, 0.41, 0.42, 0.42, 0.42]);
    expect(stalled.stalled).toBe(true);
    expect(stalled.trend).toBe("stalled");

    const done = evaluateConvergence([0.4, 0.7, 0.96]);
    expect(done.converged).toBe(true);
    expect(done.stalled).toBe(false);
  });

  it("plans deterministic exponential backoff with a cap", () => {
    expect(planRetryDelayMs(1)).toBe(500);
    expect(planRetryDelayMs(2)).toBe(1000);
    expect(planRetryDelayMs(3)).toBe(2000);
    expect(planRetryDelayMs(8)).toBe(30_000);
    expect(planRetryDelayMs(0)).toBe(500);
  });

  it("aborts hard at the iteration depth cap", () => {
    const directive = nextLoopDirective({
      iterationCount: LOOP_LIMITS.defaultMaxIterations,
      signatures: [],
      progressSamples: [0.1, 0.2],
      consecutiveFailures: 0,
    });
    expect(directive.action).toBe("abort");
    expect(directive.state).toBe("depth_capped");
    expect(directive.reason).toContain("Iterations-Cap");
  });

  it("switches strategy on signature loops without progress", () => {
    const signature = stepSignature({ kind: "edit", target: "same.ts" });
    const directive = nextLoopDirective({
      iterationCount: 6,
      signatures: [signature, signature, signature],
      progressSamples: [0.4, 0.4, 0.4, 0.4, 0.4],
      consecutiveFailures: 0,
    });
    expect(directive.action).toBe("alternate-strategy");
    expect(directive.state).toBe("loop_detected");
  });

  it("walks the self-healing escalation ladder for failures", () => {
    const base = { iterationCount: 3, signatures: [], progressSamples: [0.1, 0.3, 0.5] };
    expect(nextLoopDirective({ ...base, consecutiveFailures: 1 }).action).toBe("retry");
    expect(nextLoopDirective({ ...base, consecutiveFailures: 2 }).action).toBe("retry");
    expect(nextLoopDirective({ ...base, consecutiveFailures: 3 }).action).toBe("alternate-strategy");
    expect(nextLoopDirective({ ...base, consecutiveFailures: 4 }).action).toBe("alternate-strategy");
    expect(nextLoopDirective({ ...base, consecutiveFailures: 5 }).action).toBe("escalate");
    expect(nextLoopDirective({ ...base, consecutiveFailures: 1 }).retryDelayMs).toBe(500);
  });

  it("escalates when progress stalls without failures", () => {
    const directive = nextLoopDirective({
      iterationCount: 8,
      signatures: ["unique-1", "unique-2", "unique-3"],
      progressSamples: [0.5, 0.5, 0.51, 0.51, 0.51, 0.51],
      consecutiveFailures: 0,
    });
    expect(directive.action).toBe("escalate");
    expect(directive.state).toBe("stalled");
  });

  it("keeps healthy runs running and reports convergence", () => {
    const directive = nextLoopDirective({
      iterationCount: 5,
      signatures: ["s1", "s2", "s3"],
      progressSamples: [0.2, 0.4, 0.6, 0.75, 0.85],
      consecutiveFailures: 0,
    });
    expect(directive.action).toBe("continue");
    expect(directive.state).toBe("running");
  });
});

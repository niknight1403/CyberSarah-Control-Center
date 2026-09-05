import { describe, expect, it } from "vitest";
import { decideAdmission, evaluateUsageBudget } from "../lib/usage-budget-logic";

const config = {
  windowStartMs: 0,
  windowEndMs: 1_000_000,
  limitCostUnits: 100,
  warnThresholdPercent: 80,
};

describe("usage budget logic", () => {
  it("sums only entries inside the configured window", () => {
    const result = evaluateUsageBudget(
      [
        { timestampMs: 10, costUnits: 20 },
        { timestampMs: 2_000_000, costUnits: 500 },
        { timestampMs: -5, costUnits: 500 },
      ],
      config,
    );
    expect(result.usedCostUnits).toBe(20);
    expect(result.level).toBe("ok");
  });

  it("ignores invalid cost values deterministically", () => {
    const result = evaluateUsageBudget(
      [
        { timestampMs: 10, costUnits: -3 },
        { timestampMs: 20, costUnits: Number.NaN },
        { timestampMs: 30, costUnits: 10 },
      ],
      config,
    );
    expect(result.usedCostUnits).toBe(10);
  });

  it("reports a warning once the warn threshold is reached", () => {
    const result = evaluateUsageBudget([{ timestampMs: 5, costUnits: 80 }], config);
    expect(result.level).toBe("warning");
    expect(result.usagePercent).toBe(80);
  });

  it("caps the reported percentage at 100 and reports exhaustion", () => {
    const result = evaluateUsageBudget([{ timestampMs: 5, costUnits: 250 }], config);
    expect(result.level).toBe("exhausted");
    expect(result.usagePercent).toBe(100);
    expect(result.remainingCostUnits).toBe(0);
  });

  it("rejects invalid window or limit configurations", () => {
    expect(() => evaluateUsageBudget([], { ...config, windowEndMs: 0 })).toThrow();
    expect(() => evaluateUsageBudget([], { ...config, limitCostUnits: 0 })).toThrow();
  });

  it("blocks admission only when the budget is exhausted", () => {
    expect(decideAdmission({ level: "ok", usedCostUnits: 1, usagePercent: 1, remainingCostUnits: 99, summary: "s" }).allowed).toBe(true);
    expect(decideAdmission({ level: "exhausted", usedCostUnits: 100, usagePercent: 100, remainingCostUnits: 0, summary: "s" }).allowed).toBe(false);
  });

  it("does not leak endpoint or credential values", () => {
    const result = evaluateUsageBudget([{ timestampMs: 1, costUnits: 90 }], config);
    expect(JSON.stringify(result)).not.toMatch(/https?:|token|key|secret/i);
  });
});

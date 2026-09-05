import { describe, expect, it } from "vitest";
import { nextRetry, planQueueRetries, type RetryableAction } from "../lib/retry-backoff-logic";

const policy = { baseDelayMs: 1_000, maxDelayMs: 60_000, maxAttempts: 5 };

function action(overrides: Partial<RetryableAction>): RetryableAction {
  return { id: "a1", attempts: 0, lastAttemptAtMs: null, conflict: false, ...overrides };
}

describe("retry backoff logic", () => {
  it("schedules the first retry after the base delay", () => {
    const outcome = nextRetry(action({ lastAttemptAtMs: 1_000 }), policy, 2_000);
    expect(outcome.shouldRetry).toBe(true);
    expect(outcome.delayMs).toBe(1_000);
    expect(outcome.nextAttemptAtMs).toBe(2_000);
    expect(outcome.attemptNumber).toBe(1);
  });

  it("doubles the delay exponentially per attempt", () => {
    expect(nextRetry(action({ attempts: 1, lastAttemptAtMs: 10_000 }), policy, 11_000).delayMs).toBe(2_000);
    expect(nextRetry(action({ attempts: 2, lastAttemptAtMs: 10_000 }), policy, 11_000).delayMs).toBe(4_000);
    expect(nextRetry(action({ attempts: 3, lastAttemptAtMs: 10_000 }), policy, 11_000).delayMs).toBe(8_000);
  });

  it("caps the delay at the configured maximum", () => {
    const longPolicy = { ...policy, maxAttempts: 20 };
    expect(nextRetry(action({ attempts: 10, lastAttemptAtMs: 10_000 }), longPolicy, 11_000).delayMs).toBe(60_000);
  });

  it("refuses retries once the attempt budget is exhausted", () => {
    const outcome = nextRetry(action({ attempts: 5, lastAttemptAtMs: 1_000 }), policy, 2_000);
    expect(outcome.shouldRetry).toBe(false);
    expect(outcome.nextAttemptAtMs).toBeNull();
    expect(outcome.reason).toContain("endgültig");
  });

  it("never retries conflicted actions regardless of remaining attempts", () => {
    const outcome = nextRetry(action({ conflict: true, attempts: 0 }), policy, 2_000);
    expect(outcome.shouldRetry).toBe(false);
    expect(outcome.reason).toContain("Konflikt");
  });

  it("anchors the schedule on the last attempt, never in the past", () => {
    const outcome = nextRetry(action({ attempts: 1, lastAttemptAtMs: 500 }), policy, 10_000);
    expect(outcome.nextAttemptAtMs).toBeGreaterThanOrEqual(10_000);
  });

  it("splits a queue into scheduled, blocked and exhausted actions", () => {
    const plan = planQueueRetries(
      [
        action({ id: "later", attempts: 1, lastAttemptAtMs: 100 }),
        action({ id: "conflict", conflict: true }),
        action({ id: "done", attempts: 5 }),
      ],
      policy,
      1_000,
    );
    expect(plan.scheduled.map((item) => item.id)).toEqual(["later"]);
    expect(plan.blocked.map((item) => item.id)).toEqual(["conflict"]);
    expect(plan.exhausted.map((item) => item.id)).toEqual(["done"]);
  });

  it("rejects invalid policies", () => {
    expect(() => nextRetry(action({}), { ...policy, baseDelayMs: 0 }, 0)).toThrow();
    expect(() => nextRetry(action({}), { ...policy, maxDelayMs: 10 }, 0)).toThrow();
    expect(() => nextRetry(action({}), { ...policy, maxAttempts: 0 }, 0)).toThrow();
  });
});

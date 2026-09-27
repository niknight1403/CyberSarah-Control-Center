import { describe, expect, it } from "vitest";

import { accumulateEvent, buildFunnelSummary, isValidEventKind, pruneBuckets, validateEventInput } from "../lib/analytics-logic";

describe("analytics logic (Sprint 267)", () => {
  it("lehnt unbekannte Ereignisse und Freitext-Müll ab", () => {
    expect(isValidEventKind("landing_view")).toBe(true);
    expect(isValidEventKind("kunden_name_max")).toBe(false);
    expect(validateEventInput("beliebig", "2026-09-24").valid).toBe(false);
    expect(validateEventInput("landing_view", "24.09.2026").valid).toBe(false);
  });

  it("akkumuliert Tages-Buckets deterministisch", () => {
    let buckets = accumulateEvent({}, "landing_view", "2026-09-24");
    buckets = accumulateEvent(buckets, "landing_view", "2026-09-24");
    buckets = accumulateEvent(buckets, "signup_completed", "2026-09-24");
    expect(buckets["2026-09-24"]).toEqual({ landing_view: 2, signup_completed: 1 });
  });

  it("prune begrenzt Retention auf 90 Tage per Code", () => {
    const buckets: Record<string, Partial<Record<string, number>>> = {
      "2026-01-01": { landing_view: 5 },
      "2026-09-01": { landing_view: 9 },
      "2026-09-24": { signup_completed: 3 },
    };
    const result = pruneBuckets(buckets, "2026-09-24");
    expect(result.buckets["2026-01-01"]).toBeUndefined();
    expect(result.buckets["2026-09-01"]).toBeDefined();
    expect(result.prunedDays).toBe(1);
  });

  it("Trichter-Zahlen sind ehrlich, Division durch Null benannt", () => {
    const empty = buildFunnelSummary({});
    expect(empty.signupRate).toBe("k. A.");
    expect(empty.landingViews).toBe(0);
    const buckets = accumulateEvent(accumulateEvent(accumulateEvent({}, "landing_view", "2026-09-24"), "signup_completed", "2026-09-24"), "plan_upgraded", "2026-09-24");
    const funnel = buildFunnelSummary(buckets);
    expect(funnel.signupRate).toBe("100%");
    expect(funnel.upgradeRate).toBe("100%");
  });
});

import { describe, expect, it } from "vitest";
import { refundRiskPlan } from "../lib/growth-refund-guard";
import type { GrowthMetrics } from "../lib/always-on-growth-logic";
const empty: GrowthMetrics = { impressions: 3000, views: 1000, clicks: 150, leads: 40,
  purchases: 0, refunds: 0, confirmedRevenueCents: 0, published: 3, failed: 0,
  pendingContentDrafts: 0, pendingRevenueDrafts: 0, activeExperiments: 0 };
describe("Sprint 02 – refund guard", () => {
  it("does not infer refund danger from 1 refund", () => {
    expect(refundRiskPlan({ ...empty, purchases: 5, refunds: 1 })).toBeNull();
  });
  it("protects customers when refunds exceed one fifth of purchases", () => {
    const result = refundRiskPlan({ ...empty, purchases: 20, refunds: 5 });
    expect(result?.focus).toBe("REFUNDS");
    expect(result?.stage).toBe("repair");
    expect(result?.spendingAuthorized).toBe(false);
    expect(result?.publishingAuthorized).toBe(false);
  });
  it("explicitly accounts for delayed refund cohorts", () => {
    expect(refundRiskPlan({ ...empty, purchases: 5, refunds: 5 })?.reason).toContain("zeitversetzt");
  });
  it("uses 20 purchases as evidence threshold without making profit claims", () => {
    expect(refundRiskPlan({ ...empty, purchases: 9, refunds: 3 })?.evidence).toBe("low");
    expect(refundRiskPlan({ ...empty, purchases: 20, refunds: 5 })?.evidence).toBe("measured");
  });
});

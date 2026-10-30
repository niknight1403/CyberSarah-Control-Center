import { describe, expect, it } from "vitest";
import { auditGrowthMetrics } from "../lib/growth-data-quality";
import type { GrowthMetrics } from "../lib/always-on-growth-logic";
const base: GrowthMetrics = {
  impressions: 1000, views: 500, clicks: 50, leads: 15, purchases: 4, refunds: 1,
  confirmedRevenueCents: 18000, published: 9, failed: 1,
  pendingContentDrafts: 0, pendingRevenueDrafts: 0, activeExperiments: 1,
};
describe("Growth Pulse Sprint 01 – trustworthy counters", () => {
  it("accepts coherent measured counters", () => {
    expect(auditGrowthMetrics(base).status).toBe("valid");
  });
  it.each([NaN, Infinity, -1, 0.8, Number.MAX_SAFE_INTEGER + 1])("blocks invalid counters: %s", input => {
    const report = auditGrowthMetrics({ ...base, clicks: input });
    expect(report.status).toBe("blocked");
    expect(report.errors.some(e => e.includes("clicks"))).toBe(true);
  });
  it("accepts negative net revenue if refunds occurred", () => {
    expect(auditGrowthMetrics({ ...base, confirmedRevenueCents: -1200 }).status).toBe("valid");
  });
  it("flags incompatible funnel counts for human review, not automatic tampering", () => {
    const report = auditGrowthMetrics({ ...base, views: 1100, leads: 55, purchases: 60, refunds: 70 });
    expect(report.status).toBe("review");
    expect(report.warnings).toHaveLength(4);
    expect(report.errors).toHaveLength(0);
  });
  it("signals truncated publishing history and rejected insight counts", () => {
    const report = auditGrowthMetrics(base, new Date("2026-10-30T00:00:00Z"),
      { jobsTruncated: true, invalidInsightValues: 3, latestEvidenceAt: "2026-10-30T00:00:00Z" });
    expect(report.status).toBe("review");
    expect(report.warnings).toHaveLength(2);
    expect(report.reviewedAt).toBe("2026-10-30T00:00:00.000Z");
  });

  it("warns about downstream conversions without corresponding upstream attribution", () => {
    const report = auditGrowthMetrics({ ...base, impressions: 0, views: 20, clicks: 0, leads: 10, purchases: 3 });
    expect(report.status).toBe("review");
    expect(report.warnings.some(w => w.includes("ohne Impressionen"))).toBe(true);
    expect(report.warnings.some(w => w.includes("ohne Klickdaten"))).toBe(true);
  });
  it("cannot claim complete purchase funnel if leads are not recorded", () => {
    const report = auditGrowthMetrics({ ...base, leads: 0, purchases: 3 });
    expect(report.status).toBe("review");
    expect(report.warnings.some(w => w.includes("ohne Leads"))).toBe(true);
  });

  it("flags old metrics as a review, not evidence of current growth", () => {
    const result = auditGrowthMetrics(base, new Date("2026-10-30T12:00:00Z"),
      { latestEvidenceAt: "2026-10-20T12:00:00Z" });
    expect(result.status).toBe("review");
    expect(result.warnings.some(w => w.includes("72 Stunden"))).toBe(true);
  });
  it("does not fabricate freshness for metrics without observation timestamp", () => {
    const result = auditGrowthMetrics(base, new Date("2026-10-30T12:00:00Z"),
      { latestEvidenceAt: null });
    expect(result.warnings.some(w => w.includes("Beobachtungszeit"))).toBe(true);
  });

});

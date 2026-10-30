import { describe, expect, it } from "vitest";
import { decideGrowthPlan, growthPulseFingerprint, growthRateCard, growthPulseEnabled, type GrowthMetrics } from "../lib/always-on-growth-logic";
const empty: GrowthMetrics = {
  impressions: 0, views: 0, clicks: 0, leads: 0,
  purchases: 0, refunds: 0, confirmedRevenueCents: 0,
  published: 0, failed: 0, pendingContentDrafts: 0,
  pendingRevenueDrafts: 0, activeExperiments: 0,
};
const plan = (patch: Partial<GrowthMetrics> = {}) => decideGrowthPlan({ ...empty, ...patch });
describe("24/7 Growth Pulse decision quality and safety", () => {
  it("honors operator off switches in both in-server and cron loops", () => {
    expect(growthPulseEnabled(undefined, undefined)).toBe(true);
    expect(growthPulseEnabled("off", undefined)).toBe(false);
    expect(growthPulseEnabled("ON", "OFF")).toBe(false);
    expect(growthPulseEnabled("on", "on")).toBe(true);
  });
  it("starts with evidence gathering, never fictional monetization data", () => {
    const value = plan();
    expect(value.focus).toBe("REACH");
    expect(value.evidence).toBe("none");
    expect(value.spendingAuthorized).toBe(false);
    expect(value.publishingAuthorized).toBe(false);
    expect(value.priceChangesAuthorized).toBe(false);
    expect(growthRateCard(empty).purchaseRatePct).toBeNull();
    expect(growthRateCard(empty).profitabilityVerified).toBe(false);
  });
  it("blocks queue floods before producing additional content", () => {
    expect(plan({ pendingContentDrafts: 5, pendingRevenueDrafts: 3 }).focus).toBe("QUEUE");
    expect(plan({ activeExperiments: 6, impressions: 5000 }).focus).toBe("QUEUE");
  });
  it("fixes publishing errors before scaling reach", () => {
    expect(plan({ published: 6, failed: 4, impressions: 20000 }).focus).toBe("RELIABILITY");
  });
  it("proposes hooks if impression-to-view engagement is low", () => {
    expect(plan({ impressions: 3000, views: 60 }).focus).toBe("HOOKS");
  });
  it("proposes CTA when views exist but intent is lacking", () => {
    expect(plan({ impressions: 5000, views: 2000, clicks: 4 }).focus).toBe("CTA");
  });
  it("proposes landing when traffic exists but leads are lacking", () => {
    expect(plan({ impressions: 6000, views: 3000, clicks: 50, leads: 2 }).focus).toBe("LANDING");
  });
  it("proposes offer fit only if leads are present but sales lag", () => {
    expect(plan({ impressions: 5000, views: 2400, clicks: 100, leads: 30, purchases: 0 }).focus).toBe("OFFER");
  });
  it("does not declare profit on revenue alone", () => {
    const item = plan({ impressions: 5000, views: 2400, clicks: 100, leads: 60, purchases: 5, confirmedRevenueCents: 100000 });
    expect(item.focus).toBe("PROFIT_EVIDENCE");
    expect(item.primaryMetric).toContain("contribution");
    expect(item.reason).toContain("Kosten");
  });
  it("uses bounded evidence fingerprint without activity at every minor change", () => {
    expect(growthPulseFingerprint({ ...empty, impressions: 501, views: 51 }))
      .toBe(growthPulseFingerprint({ ...empty, impressions: 502, views: 52 }));
    expect(growthPulseFingerprint({ ...empty, impressions: 501, views: 51 }))
      .not.toBe(growthPulseFingerprint({ ...empty, impressions: 751, views: 51 }));
  });
  it("reports null ratios without any denominators and never positive verified profit", () => {
    expect(growthRateCard({ ...empty, impressions: 1000, views: 100, clicks: 5, leads: 1 }))
      .toMatchObject({ viewRatePct: 10, clickRatePct: 5, leadRatePct: 20, purchaseRatePct: 0, profitabilityVerified: false });
  });
});

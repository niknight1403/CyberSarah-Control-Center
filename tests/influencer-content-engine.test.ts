import { describe, expect, it } from "vitest";
import { scoreTrend, rankTrends } from "../lib/influencer-engine/trend-analyzer";
import { buildShortScriptBlueprint } from "../lib/influencer-engine/short-script";
import { buildVisualPrompt } from "../lib/influencer-engine/visual-prompt";
import { addHealthDisclaimer, reviewHealthCopy } from "../lib/influencer-engine/health-compliance";
import { rankAffiliateOffers } from "../lib/influencer-engine/affiliate-strategy";
import { buildPublishingPlan } from "../lib/influencer-engine/publishing-plan";
import { buildHookExperiment, chooseVariantByMetric } from "../lib/influencer-engine/experimentation";
import { analyzeContentMetrics } from "../lib/influencer-engine/analytics-feedback";
import { buildCampaignPlan } from "../lib/influencer-engine/campaign-orchestrator";

describe("Influencer Engine Sprints 1-10", () => {
  it("rankt Trends mit EU-Relevanz und Saettigung", () => {
    const high = scoreTrend({ topic: "Schlafroutine", velocity: 90, engagement: 80, saturation: 20, euRelevance: 90 });
    expect(high.opportunity).toBe("high");
    expect(rankTrends([
      { topic: "Alpha", velocity: 100, engagement: 100, saturation: 0, euRelevance: 100 },
      { topic: "Beta", velocity: 10, engagement: 10, saturation: 100, euRelevance: 10 },
    ])[0].topic).toBe("Alpha");
  });

  it("baut 15-30s Short-Blueprint mit Hook und CTA", () => {
    const script = buildShortScriptBlueprint({ topic: "Magnesium", audience: "Erwachsene", platform: "tiktok" });
    expect(script.durationSeconds).toBeGreaterThanOrEqual(15);
    expect(script.durationSeconds).toBeLessThanOrEqual(30);
    expect(script.hook).toContain("Magnesium");
    expect(script.cta.length).toBeGreaterThan(10);
  });

  it("erzwingt Avatar-Alter 35-60 und Referenz-ID", () => {
    const prompt = buildVisualPrompt({
      topic: "Wellness",
      format: "9:16",
      avatar: { referenceId: "nova-ref", age: 70, presentation: "ruhig", signatureLook: "silberne Brille" },
    });
    expect(prompt).toContain("age 60");
    expect(prompt).toContain("nova-ref");
  });

  it("erkennt Health-Claims und fehlende Affiliate-Kennzeichnung", () => {
    const review = reviewHealthCopy("Dieses Mittel heilt garantiert.", true);
    expect(review.ok).toBe(false);
    expect(review.issues.map(i => i.code)).toContain("cure_claim");
    expect(review.issues.map(i => i.code)).toContain("guarantee");
    expect(review.issues.map(i => i.code)).toContain("missing_disclosure");
    expect(addHealthDisclaimer("Test")).toContain("keine individuelle medizinische Beratung");
  });

  it("priorisiert Angebots-Fit vor Provision", () => {
    const ranked = rankAffiliateOffers([
      { name: "Passend", category: "wellness", commissionPercent: 5, evidenceFit: 95, audienceFit: 95 },
      { name: "Provision", category: "wellness", commissionPercent: 30, evidenceFit: 20, audienceFit: 20 },
    ]);
    expect(ranked[0].name).toBe("Passend");
    expect(ranked[0].disclosure).toContain("Affiliate");
  });

  it("setzt Publishing auf manuellen Review", () => {
    const plan = buildPublishingPlan(["instagram", "tiktok", "instagram"]);
    expect(plan).toHaveLength(2);
    expect(plan.every(item => item.requiresReview)).toBe(true);
    expect(plan[0].checklist.join(" ")).toContain("Freigabe");
  });

  it("liefert drei Hook-Varianten und waehlt nach Metrik", () => {
    expect(buildHookExperiment("Schlaf").map(v => v.id)).toEqual(["A", "B", "C"]);
    expect(chooseVariantByMetric({ A: 1.2, B: 2.9, C: 2.1 })).toBe("B");
    expect(chooseVariantByMetric({})).toBeNull();
  });

  it("leitet Analytics-Empfehlungen aus echten Metriken ab", () => {
    const feedback = analyzeContentMetrics({ views: 1000, averageWatchSeconds: 5, durationSeconds: 20, saves: 2, shares: 1, clicks: 3 });
    expect(feedback.retentionRate).toBe(25);
    expect(feedback.recommendations.length).toBeGreaterThan(1);
  });

  it("orchestriert End-to-End ohne automatische Veroeffentlichung", () => {
    const plan = buildCampaignPlan({
      topic: "Schlafhygiene",
      audience: "Erwachsene 35-60",
      persona: { referenceId: "cybersarah-nova", age: 45, presentation: "vertrauenswuerdig", signatureLook: "dezentes Cyan" },
      platforms: ["instagram", "tiktok"],
      trends: [{ topic: "Abendroutine", velocity: 80, engagement: 75, saturation: 30, euRelevance: 90 }],
      affiliateOffers: [],
    });
    expect(plan.script.durationSeconds).toBeGreaterThanOrEqual(15);
    expect(plan.visualPrompt).toContain("cybersarah-nova");
    expect(plan.publishing.every(p => p.requiresReview)).toBe(true);
    expect(plan.experiments).toHaveLength(3);
    expect(plan.readyForManualReview).toBe(true);
  });

  it("blockiert Kampagnen mit problematischen Health-Claims", () => {
    const plan = buildCampaignPlan({
      topic: "Heilung garantiert",
      audience: "Erwachsene",
      persona: { referenceId: "x", age: 45, presentation: "ruhig", signatureLook: "neutral" },
      platforms: ["instagram"],
    });
    expect(plan.readyForManualReview).toBe(false);
    expect(plan.compliance.issues.length).toBeGreaterThan(0);
  });
});

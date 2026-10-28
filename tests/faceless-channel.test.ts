import { describe, expect, it } from "vitest";
import {
  AFFILIATE_CANDIDATES, STARTER_VIDEOS, auditContentQuality, automationOpportunityScore,
  build30DayPlan, buildDisclosureChecklist, buildShortPlan, decideWeeklyOptimization,
  launchReadiness, revenueScenario, scoreNiches,
} from "../lib/faceless-channel-logic";

describe("faceless channel 10-sprint engine",()=>{
  it("selects AI automation from the explicit niche scorecard",()=>{
    expect(scoreNiches()[0].key).toBe("ai-automation-smb");
  });
  it("prioritizes repeatable work but gates risky automation",()=>{
    const result=automationOpportunityScore({frequencyPerWeek:25,minutesPerRun:10,standardization:90,errorRisk:70,dataRisk:60});
    expect(result.weeklyMinutes).toBeGreaterThan(200);
    expect(result.requiresHumanGate).toBe(true);
  });
  it("ships three distinct long-form starter briefs",()=>{
    expect(STARTER_VIDEOS).toHaveLength(3);
    expect(new Set(STARTER_VIDEOS.map(x=>x.problem)).size).toBe(3);
  });
  it("derives twelve non-duplicate short treatments",()=>{
    const shorts=buildShortPlan();
    expect(shorts).toHaveLength(12);
    expect(shorts.every(x=>x.duplicateUpload===false)).toBe(true);
  });
  it("keeps affiliate candidates unclaimed until verified",()=>{
    expect(AFFILIATE_CANDIDATES.every(x=>x.status==="candidate-not-partner")).toBe(true);
  });
  it("requires explicit commercial and realistic-AI disclosures when applicable",()=>{
    const d=buildDisclosureChecklist({affiliate:true,sponsored:true,realisticSynthetic:true});
    expect(d.affiliate.length).toBeGreaterThan(0);
    expect(d.sponsored.length).toBeGreaterThan(0);
    expect(d.ai.length).toBeGreaterThan(0);
    expect(d.externalGate).toBe(true);
  });
  it("creates a realistic 30-day plan with only three longforms",()=>{
    const plan=build30DayPlan();
    expect(plan.days).toHaveLength(30);
    expect(plan.longforms).toBe(3);
    expect(plan.shorts).toBe(12);
  });
  it("blocks thin or unverifiable long-form content",()=>{
    const bad=auditContentQuality({scriptWords:300,originalExample:false,sourceCount:0,hasHumanGate:false,assetLicensesDocumented:false,claimsVerified:false,ctaMatchesProblem:false});
    expect(bad.passed).toBe(false);
    const good=auditContentQuality({scriptWords:1100,originalExample:true,sourceCount:3,hasHumanGate:true,assetLicensesDocumented:true,claimsVerified:true,ctaMatchesProblem:true});
    expect(good.passed).toBe(true);
  });
  it("keeps modeled revenue separate from guarantees",()=>{
    const result=revenueScenario({monthlyLongformViews:10000,ctaClickPct:3,landingConversionPct:35,affiliateClicksPerLead:0.75,paidConversionPct:3,assumedAffiliateValueCents:4000,digitalProductBuyerPct:2,digitalProductPriceCents:2900,yppRpmCents:600,yppEligible:false});
    expect(result.modeledTotalCents).toBeGreaterThan(0);
    expect(result.modeledYppCents).toBe(0);
    expect(result.guarantee).toBe(false);
    expect(result.assumptionsOnly).toBe(true);
  });
  it("optimizes one measured bottleneck at a time",()=>{
    const history=[{impressions:4000,views:300,ctrPct:7,averageViewSeconds:260,averageVideoSeconds:500,returningViewers:30,qualifiedClicks:20,emailSignups:8,confirmedRevenueCents:0}];
    const result=decideWeeklyOptimization({impressions:5000,views:200,ctrPct:4,averageViewSeconds:250,averageVideoSeconds:500,returningViewers:20,qualifiedClicks:10,emailSignups:3,confirmedRevenueCents:0},history);
    expect(result.action).toBe("PACKAGING");
    expect(result.changeOneVariable).toBe(true);
  });
  it("exposes the whole launch system without enabling external actions",()=>{
    const ready=launchReadiness();
    expect(ready.starterVideos).toHaveLength(3);
    expect(ready.shorts).toHaveLength(12);
    expect(ready.externalActionsRequireApproval).toBe(true);
  });
});

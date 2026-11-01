import {describe,it,expect} from "vitest";
import {
  AI_INFLUENZA_AGENTS,
  AI_INFLUENZA_PACKAGES,
  buildAiInfluenzaMonthlyPlan,
  calculateAiInfluenzaUnitEconomics,
  canAdvanceAiInfluenzaStep,
  nextAiInfluenzaStep,
} from "../lib/ai-influenza-team-logic";

describe("AI Influenza Team domain",()=>{
  it("defines the three bookable packages and eight specialist agents",()=>{
    expect(Object.keys(AI_INFLUENZA_PACKAGES)).toEqual(["starter","growth","business"]);
    expect(AI_INFLUENZA_PACKAGES.starter.monthlyPriceCents).toBe(29900);
    expect(AI_INFLUENZA_PACKAGES.growth.monthlyPriceCents).toBe(99900);
    expect(AI_INFLUENZA_PACKAGES.business.monthlyPriceCents).toBe(249900);
    expect(AI_INFLUENZA_AGENTS).toHaveLength(8);
    expect(AI_INFLUENZA_AGENTS.every(agent=>agent.externalActionAllowed===false)).toBe(true);
  });

  it("keeps assisted mode autonomous internally but approval-gated for sensitive steps",()=>{
    expect(canAdvanceAiInfluenzaStep({
      mode:"assisted",from:"market-analysis",to:"target-research",approved:false,budgetCents:5000,estimatedCostCents:100,
    }).allowed).toBe(true);
    expect(canAdvanceAiInfluenzaStep({
      mode:"assisted",from:"approval",to:"contact-preparation",approved:false,budgetCents:5000,estimatedCostCents:100,
    }).allowed).toBe(false);
    expect(canAdvanceAiInfluenzaStep({
      mode:"assisted",from:"approval",to:"contact-preparation",approved:true,budgetCents:5000,estimatedCostCents:100,
    }).allowed).toBe(true);
  });

  it("builds package delivery plans and honest unit economics",()=>{
    const plan=buildAiInfluenzaMonthlyPlan("growth");
    expect(plan.find(item=>item.taskKind==="short-video")?.quantity).toBe(12);
    expect(plan.find(item=>item.taskKind==="content-post")?.quantity).toBe(20);
    expect(nextAiInfluenzaStep("payment-pending")).toBe("paid");
    expect(calculateAiInfluenzaUnitEconomics({
      recognizedRevenueCents:99900,deliveryCostCents:30000,apiCostCents:9000,
    })).toMatchObject({contributionCents:60900,profitable:true});
  });
});

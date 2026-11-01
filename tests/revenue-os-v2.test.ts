import { describe, expect, it, beforeEach } from "vitest";
import {
  allocatePersonaBudget, buildOneClickBusinessBrief, decideExperiment, deriveSystemState,
  evaluateCommercial, optimizeGrowthPortfolio, planContentFactory, profitGuard, summarizeAttribution,
} from "../lib/revenue-os-v2-logic";
import {
  providerCircuitAllows, providerCircuitSnapshot, recordProviderCircuitFailure,
  recordProviderCircuitSuccess, resetProviderCircuits, CIRCUIT_OPEN_MS,
} from "../lib/provider-circuit-breaker-logic";

describe("Revenue Autopilot 2.0 logic",()=>{
  it("never reports GREEN when a required subsystem is blocked or deferred",()=>{
    expect(deriveSystemState([{name:"db",required:true,ok:true},{name:"llm",required:true,ok:false,detail:"down"}]).state).toBe("BLOCKED");
    expect(deriveSystemState([{name:"db",required:true,ok:true},{name:"llm",required:true,ok:false,deferred:true}]).state).toBe("DEGRADED");
    expect(deriveSystemState([{name:"db",required:true,ok:true},{name:"llm",required:true,ok:true}]).state).toBe("GREEN");
  });
  it("routes more creator budget to measured affinity without starving others",()=>{
    const result=allocatePersonaBudget([
      {personaId:"nova",impressions:1000,engagements:200,clicks:100,leads:20,conversions:5,revenueCents:10000},
      {personaId:"mira",impressions:1000,engagements:20,clicks:5,leads:1,conversions:0,revenueCents:0},
    ]);
    expect(result[0].personaId).toBe("nova");
    expect(result[0].budgetShare).toBeGreaterThan(result[1].budgetShare);
    expect(result[1].budgetShare).toBeGreaterThanOrEqual(0.05);
  });
  it("balances winner scaling with exploration and protects known negative-profit channels",()=>{
    const result=optimizeGrowthPortfolio([
      {channelKey:"nova:tiktok",impressions:5000,clicks:600,leads:120,conversions:30,revenueCents:90000,costCents:15000},
      {channelKey:"mira:instagram",impressions:50,clicks:8,leads:2,conversions:0,revenueCents:0,costCents:null},
      {channelKey:"zara:x",impressions:1200,clicks:40,leads:5,conversions:1,revenueCents:1000,costCents:5000},
    ]);
    const winner=result.find(x=>x.channelKey==="nova:tiktok")!;
    const explorer=result.find(x=>x.channelKey==="mira:instagram")!;
    const loser=result.find(x=>x.channelKey==="zara:x")!;
    expect(winner.action).toBe("SCALE");
    expect(winner.allocationShare).toBeGreaterThan(explorer.allocationShare);
    expect(winner.roas).toBe(6);
    expect(explorer.action).toBe("EXPLORE");
    expect(explorer.allocationShare).toBeGreaterThanOrEqual(0.05);
    expect(loser.action).toBe("HOLD");
    expect(loser.netProfitCents).toBeLessThan(0);
  });
  it("caps content factory at 30 real asset slots",()=>{
    expect(planContentFactory(100)).toHaveLength(30);
    expect(new Set(planContentFactory(8).map(x=>x.format)).size).toBe(8);
  });
  it("summarizes only supplied attribution events",()=>{
    const result=summarizeAttribution([
      {personaId:"nova",contentId:"c1",platform:"tiktok",eventType:"impression"},
      {personaId:"nova",contentId:"c1",platform:"tiktok",eventType:"click"},
      {personaId:"nova",contentId:"c1",platform:"tiktok",eventType:"lead"},
      {personaId:"nova",contentId:"c1",platform:"tiktok",eventType:"purchase",valueCents:2500},
    ]);
    expect(result).toMatchObject({impressions:1,clicks:1,leads:1,purchases:1,revenueCents:2500});
  });
  it("uses minimum evidence before scaling experiments",()=>{
    expect(decideExperiment([{variantId:"A",exposures:10,conversions:2,revenueCents:1000},{variantId:"B",exposures:10,conversions:1,revenueCents:500}]).action).toBe("LEARN");
    expect(decideExperiment([{variantId:"A",exposures:200,conversions:40,revenueCents:10000},{variantId:"B",exposures:200,conversions:20,revenueCents:5000}])).toMatchObject({winnerId:"A",action:"SCALE"});
  });
  it("optimizes commercial score and profit from explicit inputs",()=>{
    expect(evaluateCommercial({priceCents:1000,marginPct:80,conversionProbability:.1,effortScore:10,riskScore:10,expectedReach:100}).expectedRevenueCents).toBe(10000);
    expect(profitGuard({revenueCents:10000,variableCostCents:1000,apiCostCents:500,refundsCents:500,customers:10,leads:50})).toMatchObject({netProfitCents:8000,state:"GREEN"});
  });
  it("builds one-click brief without inventing market facts",()=>{
    expect(buildOneClickBusinessBrief({idea:"KI Kurs für kleine Teams"})).toContain("Hypothese");
  });
});

describe("provider circuit breaker",()=>{
  beforeEach(()=>resetProviderCircuits());
  it("opens on rate limits and half-opens after cooldown",()=>{
    recordProviderCircuitFailure("gemini",429,120,1000);
    recordProviderCircuitFailure("gemini",429,120,1000);
    recordProviderCircuitFailure("gemini",429,120,1000);
    expect(providerCircuitAllows("gemini",1001)).toBe(false);
    expect(providerCircuitAllows("gemini",1000+CIRCUIT_OPEN_MS+1)).toBe(true);
    expect(providerCircuitSnapshot()[0].state).toBe("HALF_OPEN");
  });
  it("closes after a successful probe",()=>{
    recordProviderCircuitFailure("groq",429,50,1000);
    recordProviderCircuitSuccess("groq",40);
    expect(providerCircuitSnapshot()[0]).toMatchObject({state:"CLOSED",failures:0});
  });
});

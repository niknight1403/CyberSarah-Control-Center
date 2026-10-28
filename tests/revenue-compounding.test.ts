import { describe, expect, it } from "vitest";
import {
  compoundGrowthHealth, detectCreativeFatigue, diagnoseFunnel, estimateRetentionEconomics,
  evaluateIncrementality, evaluateReferralLoop, planLifecycleActions, prioritizeGrowthSignals,
  rankOfferEconomics,
} from "../lib/revenue-compounding-logic";

describe("compounding revenue intelligence",()=>{
  it("Sprint 1: finds the largest measured funnel leak",()=>{
    const leaks=diagnoseFunnel([
      {key:"landing-signup",entrants:1000,completions:200},
      {key:"signup-checkout",entrants:200,completions:20},
      {key:"checkout-purchase",entrants:20,completions:12},
    ]);
    expect(leaks[0]).toMatchObject({key:"signup-checkout",conversionRatePct:10,action:"FIX"});
  });

  it("Sprint 2: estimates retention economics without inventing CAC",()=>{
    const result=estimateRetentionEconomics({activeStart:100,activeEnd:100,newCustomers:10,cancellations:5,mrrCents:100000});
    expect(result).toMatchObject({churnRatePct:5,retentionRatePct:95,arpuCents:1000,estimatedLtvCents:20000,ltvToCac:null});
  });

  it("Sprint 3: prioritizes payment and checkout recovery but keeps approval gate",()=>{
    const actions=planLifecycleActions([
      {customerKey:"a",daysSinceSignup:30,daysSinceLastActivity:1,checkoutStarted:false,purchased:true,activeSubscription:true,failedPayment:true},
      {customerKey:"b",daysSinceSignup:2,daysSinceLastActivity:2,checkoutStarted:true,purchased:false,activeSubscription:false,failedPayment:false},
    ]);
    expect(actions[0]).toMatchObject({customerKey:"a",action:"DUNNING",requiresExternalApproval:true});
    expect(actions[1].action).toBe("CHECKOUT_RECOVERY");
  });

  it("Sprint 4: detects creative fatigue from measured decay",()=>{
    expect(detectCreativeFatigue([{creativeKey:"hook-a",impressions:1000,clicks:40,conversions:4,previousCtrPct:8,previousConversionRatePct:15}])[0]).toMatchObject({ctrPct:4,conversionRatePct:10,fatiguePct:50,action:"REFRESH"});
  });

  it("Sprint 5: requires holdout evidence before claiming incrementality",()=>{
    expect(evaluateIncrementality({exposedUsers:50,exposedConversions:10,holdoutUsers:50,holdoutConversions:5}).action).toBe("MEASURE");
    const proven=evaluateIncrementality({exposedUsers:1000,exposedConversions:120,holdoutUsers:1000,holdoutConversions:80,exposedRevenueCents:120000,holdoutRevenueCents:80000});
    expect(proven).toMatchObject({absoluteLiftPctPoints:4,relativeLiftPct:50,incrementalConversions:40,incrementalRevenueCents:40000,action:"SCALE"});
  });

  it("Sprint 6: measures referral compounding",()=>{
    expect(evaluateReferralLoop({customers:100,invites:200,referredSignups:80,referredCustomers:30})).toMatchObject({invitesPerCustomer:2,inviteToSignupPct:40,signupToCustomerPct:37.5,viralCoefficient:0.3,action:"COMPOUND"});
  });

  it("Sprint 7: ranks offers by contribution instead of vanity revenue",()=>{
    const ranked=rankOfferEconomics([
      {offerKey:"high-revenue-loss",exposures:1000,conversions:50,revenueCents:100000,refundsCents:10000,variableCostCents:95000},
      {offerKey:"profitable",exposures:500,conversions:20,revenueCents:60000,refundsCents:2000,variableCostCents:10000},
    ]);
    expect(ranked[0]).toMatchObject({offerKey:"profitable",contributionCents:48000,action:"SCALE"});
    expect(ranked[1].action).toBe("HOLD");
  });

  it("Sprint 8: chooses the best risk-adjusted growth action",()=>{
    const ranked=prioritizeGrowthSignals([
      {key:"retention",impact:80,confidence:.9,effort:20,risk:10,evidence:"cohort"},
      {key:"unproven",impact:100,confidence:.1,effort:10,risk:20,evidence:"hypothesis"},
      {key:"danger",impact:100,confidence:1,effort:5,risk:90,evidence:"high risk"},
    ]);
    expect(ranked.find(x=>x.key==="danger")?.action).toBe("HOLD");
    expect(ranked.find(x=>x.key==="unproven")?.action).toBe("LEARN");
    expect(ranked.some(x=>x.action==="DO_NEXT")).toBe(true);
  });

  it("Sprint 9: produces a conservative compound-growth health state",()=>{
    expect(compoundGrowthHealth({netProfitCents:10000,retentionRatePct:95,incrementalLiftPct:20,funnelHealthPct:80,organicSharePct:40}).state).toBe("COMPOUND");
    expect(compoundGrowthHealth({netProfitCents:-100,retentionRatePct:40,incrementalLiftPct:-10,funnelHealthPct:30,organicSharePct:5}).state).toBe("PROTECT");
  });

  it("Sprint 10: handles empty and zero evidence safely",()=>{
    expect(diagnoseFunnel([{key:"empty",entrants:0,completions:0}])[0]).toMatchObject({conversionRatePct:null,action:"MEASURE"});
    expect(evaluateReferralLoop({customers:0,invites:0,referredSignups:0,referredCustomers:0}).action).toBe("MEASURE");
  });
});

import { describe,expect,it } from "vitest";
import { buildAlwaysOnInfluencerPlan,buildB2BNetworkHealth,evolveInfluencerFromEvidence,prioritizeB2BNetwork } from "../lib/b2b-influencer-network-logic";

describe("B2B growth network",()=>{
  it("blocks opted-out nodes and prioritizes trusted partners",()=>{
    const ranked=prioritizeB2BNetwork([
      {key:"partner-a",kind:"partner",fit:90,intent:70,trust:90,relationshipStrength:80,estimatedValueCents:500000,lastActivityDays:2},
      {key:"optout",kind:"lead",fit:100,intent:100,trust:100,relationshipStrength:100,optedOut:true},
    ]);
    expect(ranked[0]).toMatchObject({key:"partner-a",action:"PARTNER"});
    expect(ranked.find(x=>x.key==="optout")).toMatchObject({score:0,action:"BLOCK"});
  });
  it("diagnoses stale relationships and pipeline conversion",()=>{
    const health=buildB2BNetworkHealth([
      {key:"a",kind:"lead",fit:80,intent:70,trust:70,relationshipStrength:40,lastActivityDays:45},
      {key:"b",kind:"customer",fit:90,intent:90,trust:90,relationshipStrength:90,lastActivityDays:2},
    ],[
      {stage:"qualified",strength:70},{stage:"customer",strength:90},
    ]);
    expect(health.staleNodes).toBe(1);
    expect(health.customerConversion).toBe(.5);
    expect(health.nextActions.join(" ")).toContain("Re-Qualifizierung");
  });
});

describe("24/7 influencer evolution",()=>{
  it("learns platform and pillar weights only from evidence",()=>{
    const result=evolveInfluencerFromEvidence([
      {personaId:"juno",platform:"linkedin",pillar:"B2B-Wachstum",impressions:5000,clicks:500,leads:100,conversions:20,revenueCents:100000,published:10,failed:0},
      {personaId:"juno",platform:"x",pillar:"SaaS",impressions:1000,clicks:20,leads:2,conversions:0,revenueCents:0,published:5,failed:1},
    ])[0];
    expect(result.platformWeights.linkedin).toBeGreaterThan(result.platformWeights.x);
    expect(Object.keys(result.platformWeights)).toEqual(expect.arrayContaining(["instagram","tiktok","linkedin","x","threads","bluesky"]));
    expect(result.nextExperiments.some(x=>x.dimension==="platform"&&x.reason.includes("Exploration floor"))).toBe(true);
    expect(result.pillarWeights["B2B-Wachstum"]).toBeGreaterThan(result.pillarWeights.SaaS);
    expect(result.guardrails.join(" ")).toContain("identity");
  });
  it("creates an always-on experiment queue without identity mutation",()=>{
    const evolution=evolveInfluencerFromEvidence([{personaId:"zara",platform:"tiktok",pillar:"Hooks",impressions:2000,clicks:300,leads:30,conversions:5,revenueCents:20000,published:8,failed:0}]);
    expect(buildAlwaysOnInfluencerPlan(evolution)).toMatchObject({mode:"24/7-learning",identityMutationAllowed:false,externalActionRequiresGate:true});
  });
});

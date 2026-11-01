import {describe,it,expect} from "vitest";
import {assignPersonasToB2B,buildB2BExpansionQueue,buildSaaSLoopEngineeringPlan} from "../lib/b2b-saas-loop-engineering-logic";
import type {B2BPriority} from "../lib/b2b-influencer-network-logic";

const priorities:B2BPriority[]=[
  {key:"lead-a",kind:"lead",fit:90,intent:85,trust:70,relationshipStrength:55,estimatedValueCents:500000,lastActivityDays:2,score:82,action:"QUALIFY",reason:"High fit/intent warrants qualification"},
  {key:"customer-a",kind:"customer",fit:88,intent:75,trust:92,relationshipStrength:85,estimatedValueCents:1200000,lastActivityDays:5,score:84,action:"EXPAND",reason:"Existing relationship with measured expansion fit"},
  {key:"partner-a",kind:"partner",fit:90,intent:60,trust:95,relationshipStrength:90,estimatedValueCents:900000,lastActivityDays:3,score:86,action:"PARTNER",reason:"Strong partner fit and trust"},
  {key:"blocked",kind:"lead",fit:100,intent:100,trust:100,relationshipStrength:100,estimatedValueCents:9999999,lastActivityDays:0,optedOut:true,score:0,action:"BLOCK",reason:"Opt-out/Compliance block"},
];

describe("B2B persona + SaaS loop engineering",()=>{
  it("assigns personas deterministically and excludes blocked nodes",()=>{
    const assignments=assignPersonasToB2B(priorities);
    expect(assignments).toHaveLength(3);
    expect(assignments.find(x=>x.nodeKey==="lead-a")?.primaryPersona).toBe("juno");
    expect(assignments.some(x=>x.nodeKey==="blocked")).toBe(false);
  });

  it("builds a prioritized expansion queue without autonomous external sends",()=>{
    const assignments=assignPersonasToB2B(priorities);
    const queue=buildB2BExpansionQueue(priorities,assignments,10);
    expect(queue[0]?.nodeKey).toBe("partner-a");
    expect(queue.every(item=>item.externalActionRequiresApproval)).toBe(true);
    expect(queue.some(item=>item.nodeKey==="blocked")).toBe(false);
  });

  it("selects the narrowest measurable SaaS bottleneck",()=>{
    const assignments=assignPersonasToB2B(priorities);
    const coverage=buildSaaSLoopEngineeringPlan({
      healthScore:62,activeNodes:10,staleNodes:0,relationshipCoverage:.4,customerConversion:.3,
      avgTrust:72,avgRelationshipStrength:60,stages:{qualified:4,engaged:3,customers:2,partners:1},
    },priorities,assignments);
    expect(coverage.focus).toBe("coverage");
    expect(coverage.ownerPersona).toBe("nova");

    const conversion=buildSaaSLoopEngineeringPlan({
      healthScore:68,activeNodes:10,staleNodes:0,relationshipCoverage:.9,customerConversion:.1,
      avgTrust:80,avgRelationshipStrength:70,stages:{qualified:6,engaged:2,customers:1,partners:1},
    },priorities,assignments);
    expect(conversion.focus).toBe("conversion");
    expect(conversion.ownerPersona).toBe("juno");
    expect(conversion.stages).toContain("Learn: Persona- und Loop-Gewichte aus gemessener Evidenz aktualisieren");
  });
});

import {describe,it,expect} from "vitest";
import {buildB2BSalesReadiness} from "../lib/b2b-sales-readiness-logic";
import type {B2BPriority} from "../lib/b2b-influencer-network-logic";

const rows:B2BPriority[]=[
  {key:"hot",kind:"lead",fit:95,intent:90,trust:85,relationshipStrength:75,estimatedValueCents:2000000,lastActivityDays:1,score:88,action:"QUALIFY",reason:"high"},
  {key:"warm",kind:"lead",fit:70,intent:55,trust:65,relationshipStrength:50,estimatedValueCents:300000,lastActivityDays:10,score:62,action:"QUALIFY",reason:"medium"},
  {key:"blocked",kind:"lead",fit:100,intent:100,trust:100,relationshipStrength:100,estimatedValueCents:9999999,lastActivityDays:0,optedOut:true,score:0,action:"BLOCK",reason:"optout"},
];

describe("B2B sales readiness",()=>{
  it("ranks high-intent commercial evidence and preserves opt-outs",()=>{
    const out=buildB2BSalesReadiness(rows);
    expect(out.find(x=>x.nodeKey==="hot")?.tier).toBe("hot");
    expect(out.find(x=>x.nodeKey==="warm")?.tier).toBe("warm");
    expect(out.find(x=>x.nodeKey==="blocked")?.tier).toBe("blocked");
    expect(out.find(x=>x.nodeKey==="blocked")?.nextInternalStep).toContain("Keine Aktion");
  });
});

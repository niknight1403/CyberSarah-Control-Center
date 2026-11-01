import {describe,it,expect} from "vitest";
import {
  aiInfluenzaLeadNodeKey,
  evaluateAiInfluenzaContactPolicy,
  scoreAiInfluenzaLead,
} from "../lib/ai-influenza-lead-logic";

describe("AI Influenza lead compliance",()=>{
  it("scores commercial evidence deterministically",()=>{
    expect(scoreAiInfluenzaLead({
      automationPain:90,contentNeed:80,budgetSignal:85,engagement:70,strategicFit:95,
    })).toEqual({score:85,tier:"hot"});
  });
  it("deduplicates companies by normalized domain key",()=>{
    expect(aiInfluenzaLeadNodeKey("https://www.Example.com/about")).toBe("ai-influenza-lead:example.com");
  });
  it("never authorizes external sending from the scoring layer",()=>{
    expect(evaluateAiInfluenzaContactPolicy({
      basis:"consent",publicSourceUrl:"https://example.com/contact",optedOut:false,
    })).toMatchObject({mayPrepare:true,maySend:false});
    expect(evaluateAiInfluenzaContactPolicy({
      basis:"opted-out",publicSourceUrl:"https://example.com/contact",optedOut:true,
    })).toMatchObject({mayPrepare:false,maySend:false});
  });
});

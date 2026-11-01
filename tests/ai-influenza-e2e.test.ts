import {describe,it,expect} from "vitest";
import {
  AI_INFLUENZA_WORKFLOW_STEPS,
  maySetPaidWithoutStripe,
  simulateAiInfluenzaTestJourney,
} from "../lib/ai-influenza-team-logic";

describe("AI Influenza Team end-to-end safety",()=>{
  it("walks a labeled test customer through the complete workflow without external side effects",()=>{
    const result=simulateAiInfluenzaTestJourney("growth");
    expect(result.testOnly).toBe(true);
    expect(result.paymentStatus).toBe("test-only");
    expect(result.externalActionsExecuted).toBe(0);
    expect(result.visited).toEqual([...AI_INFLUENZA_WORKFLOW_STEPS]);
    expect(result.completed).toBe(true);
    expect(result.deliveryPlan.find(x=>x.taskKind==="short-video")?.quantity).toBe(12);
    expect(result.truthNote).toContain("Keine Live-Zahlung");
  });

  it("forbids manual paid transitions for real orders",()=>{
    expect(maySetPaidWithoutStripe(false,"paid")).toBe(false);
    expect(maySetPaidWithoutStripe(true,"paid")).toBe(true);
    expect(maySetPaidWithoutStripe(false,"onboarding")).toBe(true);
  });
});

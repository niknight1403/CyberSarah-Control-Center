import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { agentStripeWritePolicy } from "../modules/revenue-os/artifacts/api-server/src/lib/stripeAgentSafety";
describe("Revenue agent Stripe financial safety", () => {
  it("denies all unattended live-mode product writes even if user opts in to test-mode experiments", () => {
    expect(agentStripeWritePolicy({ STRIPE_MODE:"live", STRIPE_AUTONOMOUS_WRITES_APPROVED:"on" }).allowed).toBe(false);
    expect(agentStripeWritePolicy({ STRIPE_MODE:"live" }).allowed).toBe(false);
    expect(agentStripeWritePolicy({}).allowed).toBe(false);
  });
  it("requires deliberate opt-in AND explicit test-mode", () => {
    expect(agentStripeWritePolicy({ STRIPE_MODE:"test" }).allowed).toBe(false);
    expect(agentStripeWritePolicy({ STRIPE_MODE:"test",STRIPE_AUTONOMOUS_WRITES_APPROVED:"on" }).allowed).toBe(true);
  });
  it("every known mutating V5 agent method checks the policy before obtaining Stripe write client", () => {
    const cases: Record<string,string[]> = {
      RevenueAnalystAgent: ["dynamicPricing","autoCrossSell","autoDiscount"],
      MonetizationAgent: ["erstelleUpsellProdukte","dynamicPricing","autoBundle","flashSale"],
    };
    for(const [file, methods] of Object.entries(cases)){
      const source=readFileSync("modules/revenue-os/artifacts/api-server/src/agents/"+file+".ts","utf8");
      for(const method of methods){
        const i=source.indexOf("private async "+method+"(");
        expect(i,file+"."+method).toBeGreaterThan(-1);
        const end=source.indexOf("const stripe = getStripeClient()",i);
        const guard=source.indexOf("const policy = agentStripeWritePolicy(process.env)",i);
        expect(guard,file+"."+method).toBeGreaterThan(i);
        expect(end,file+"."+method).toBeGreaterThan(guard);
        expect(source.slice(i,end)).toContain("if (!policy.allowed) return");
      }
    }
  });
});

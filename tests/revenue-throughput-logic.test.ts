import {describe,it,expect} from "vitest";
import {buildRevenueThroughputSnapshot} from "../lib/revenue-throughput-logic";

const base={
  currentMrrEur:1200,activeSubscriptions:20,
  landingViews:1000,signups:200,checkoutStarts:80,upgrades:40,
  stripeCheckoutSuccessRate:80,invoiceSuccessRate:99,
  recent7RevenueCents:70000,previous7RevenueCents:56000,
  recent7Conversions:14,previous7Conversions:10,
  stripeConnected:true,stripeWebhookConfigured:true,
  digistoreIpnConfigured:true,digistoreApiConfigured:true,
  databaseReady:true,providerCircuitsOpen:0,providerCircuitsTotal:3,
};

describe("revenue throughput supervisor",()=>{
  it("computes measured revenue velocity without inventing MRR projection",()=>{
    const out=buildRevenueThroughputSnapshot(base);
    expect(out.revenueVelocity.recent7RevenueEur).toBe(700);
    expect(out.revenueVelocity.changePct).toBe(25);
    expect(out.revenueVelocity.monthlyRunRateEur).toBe(3000);
    expect(out.mrrVelocity.available).toBe(false);
    expect(out.mrrVelocity.projectedMrrEur).toBeNull();
    expect(out.status).toBe("scale");
  });

  it("prioritizes payment, database, provider and funnel blockers",()=>{
    const out=buildRevenueThroughputSnapshot({
      ...base,
      databaseReady:false,
      stripeConnected:false,
      stripeWebhookConfigured:false,
      digistoreIpnConfigured:false,
      providerCircuitsOpen:3,
      providerCircuitsTotal:3,
      signups:100,
      checkoutStarts:20,
      upgrades:5,
      invoiceSuccessRate:80,
    });
    expect(out.status).toBe("repair");
    expect(out.blockers.join(" ")).toContain("Revenue-Datenbank");
    expect(out.blockers.join(" ")).toContain("Stripe");
    expect(out.blockers.join(" ")).toContain("Digistore24");
    expect(out.blockers.join(" ")).toContain("LLM-Provider");
    expect(out.blockers.join(" ")).toContain("Invoice");
    expect(out.priorities.every((item)=>item.kind==="repair")).toBe(true);
  });
});

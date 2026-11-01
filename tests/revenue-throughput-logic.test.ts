import {describe,it,expect} from "vitest";
import {buildRevenueThroughputSnapshot} from "../lib/revenue-throughput-logic";

const base={
  currentMrrEur:1200,newMrr1dEur:40,newMrr7dEur:210,activeSubscriptions:20,
  landingViews:100,signups:80,checkoutStarts:70,upgrades:60,
  stripeCheckoutSuccessRate:80,invoiceSuccessRate:99,
  recent7RevenueCents:70000,previous7RevenueCents:56000,
  recent7Conversions:14,previous7Conversions:10,
  stripeConnected:true,stripeWebhookConfigured:true,
  digistoreIpnConfigured:true,digistoreApiConfigured:true,
  databaseReady:true,providerCircuitsOpen:0,providerCircuitsTotal:3,
  stripeWebhookConsecutiveFailures:0,digistoreWebhookConsecutiveFailures:0,
};

describe("revenue throughput supervisor",()=>{
  it("computes measured revenue velocity without inventing MRR projection",()=>{
    const out=buildRevenueThroughputSnapshot(base);
    expect(out.revenueVelocity.recent7RevenueEur).toBe(700);
    expect(out.revenueVelocity.changePct).toBe(25);
    expect(out.revenueVelocity.monthlyRunRateEur).toBe(3000);
    expect(out.grossMrrAcquisition.avgDailyNewMrr7dEur).toBe(30);
    expect(out.grossMrrAcquisition.gross30dAcquisitionRunRateEur).toBe(900);
    expect(out.checkoutFriction.status).toBe("healthy");
    expect(out.checkoutFriction.source).toBe("stripe-checkout");
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
      stripeCheckoutSuccessRate:35,
      stripeWebhookConsecutiveFailures:4,
      digistoreWebhookConsecutiveFailures:3,
    });
    expect(out.status).toBe("repair");
    expect(out.blockers.join(" ")).toContain("Revenue-Datenbank");
    expect(out.blockers.join(" ")).toContain("Stripe");
    expect(out.blockers.join(" ")).toContain("Digistore24");
    expect(out.blockers.join(" ")).toContain("LLM-Provider");
    expect(out.checkoutFriction.status).toBe("critical");
    expect(out.blockers.join(" ")).toContain("Invoice");
    expect(out.blockers.join(" ")).toContain("Stripe-Webhook");
    expect(out.blockers.join(" ")).toContain("Digistore24-IPN");
    expect(out.priorities.every((item)=>item.kind==="repair")).toBe(true);
  });
});

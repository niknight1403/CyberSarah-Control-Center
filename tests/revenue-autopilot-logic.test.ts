import { describe, expect, it } from "vitest";

import {
  buildRevenueOpportunities,
  revenueAutopilotStatus,
  type RevenueAutopilotSnapshot,
} from "../lib/revenue-autopilot-logic";

const base: RevenueAutopilotSnapshot = {
  landingViews: 0,
  signups: 0,
  checkoutStarts: 0,
  upgrades: 0,
  stripeCheckoutStarted: null,
  stripeCheckoutCompleted: null,
  stripeCheckoutSuccessRate: null,
  invoiceSuccessRate: null,
  invoiceAttempts: null,
  mrrEur: null,
  newMrr1dEur: null,
  newMrr7dEur: null,
  activeSubscriptions: null,
  affiliateClicks: null,
  affiliateConversions: null,
  crossSellRecommended: null,
  crossSellConverted: null,
  validatedExpansionOpportunities: 1,
  haraOpenProposals: null,
};

describe("Revenue Autopilot", () => {
  it("priorisiert Instrumentierung, wenn keine Funnel-Daten vorliegen", () => {
    const opportunities = buildRevenueOpportunities(base);
    expect(opportunities.some((item) => item.key === "instrumentation.funnel")).toBe(true);
    expect(revenueAutopilotStatus(opportunities)).toBe("instrument");
    const instrumentation = opportunities.find((item) => item.key === "instrumentation.funnel");
    expect(instrumentation).toMatchObject({ unit: "Event-Buckets", targetValue: 1, currentValue: 0 });
    expect(instrumentation?.experiment.length).toBeGreaterThan(10);
  });

  it("erzeugt keine Funnel-Luecke, wenn interne Ziele erreicht sind", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: 100,
      signups: 20,
      checkoutStarts: 10,
      upgrades: 2,
    });
    expect(opportunities.find((item) => item.key === "funnel.signup")).toBeUndefined();
    expect(opportunities.find((item) => item.key === "funnel.checkout-start")).toBeUndefined();
    expect(opportunities.find((item) => item.key === "funnel.upgrade")).toBeUndefined();
  });

  it("priorisiert belegte Checkout-Luecken mit SaaS-Hub", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: 200,
      signups: 40,
      checkoutStarts: 20,
      upgrades: 1,
      stripeCheckoutStarted: 40,
      stripeCheckoutCompleted: 12,
      stripeCheckoutSuccessRate: 30,
    });
    const stripe = opportunities.find((item) => item.key === "stripe.checkout-completion");
    expect(stripe?.hub).toBe("saas");
    expect(stripe?.score).toBeGreaterThan(0);
    expect(stripe?.evidence).toBe("medium");
    expect(stripe?.experiment.length).toBeGreaterThan(10);
    expect(stripe?.unit).toBe("%");
    expect(stripe?.targetValue).toBe(70);
    expect(stripe?.currentValue).toBe(30);
  });

  it("nutzt echte Affiliate- und Cross-Sell-Signale", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: 100,
      signups: 20,
      checkoutStarts: 10,
      upgrades: 1,
      affiliateClicks: 200,
      affiliateConversions: 1,
      crossSellRecommended: 100,
      crossSellConverted: 1,
    });
    expect(opportunities.find((item) => item.key === "affiliate.conversion")?.hub).toBe("hara");
    expect(opportunities.find((item) => item.key === "cross-sell.conversion")?.hub).toBe("loop");
  });

  it("ignoriert nicht erreichbare Funnel- und Expansion-Quellen", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: null,
      signups: null,
      checkoutStarts: null,
      upgrades: null,
      validatedExpansionOpportunities: null,
    });
    expect(opportunities.find((item) => item.key === "instrumentation.funnel")).toBeUndefined();
    expect(opportunities.find((item) => item.key === "expansion.discovery")).toBeUndefined();
  });

  it("nutzt echte Invoice-Stichprobe fuer die Evidenz", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: 100,
      signups: 20,
      checkoutStarts: 10,
      upgrades: 1,
      invoiceSuccessRate: 50,
      invoiceAttempts: 1,
      activeSubscriptions: 500,
    });
    expect(opportunities.find((item) => item.key === "saas.invoice-reliability")).toBeUndefined();
  });

  it("markiert einen gesunden Zustand ohne belegte Luecken", () => {
    const opportunities = buildRevenueOpportunities({
      ...base,
      landingViews: 100,
      signups: 20,
      checkoutStarts: 15,
      upgrades: 3,
      stripeCheckoutStarted: 10,
      stripeCheckoutCompleted: 9,
      stripeCheckoutSuccessRate: 90,
      invoiceSuccessRate: 99,
      invoiceAttempts: 25,
      activeSubscriptions: 20,
      affiliateClicks: 100,
      affiliateConversions: 5,
      crossSellRecommended: 100,
      crossSellConverted: 10,
    });
    expect(opportunities).toEqual([]);
    expect(revenueAutopilotStatus(opportunities)).toBe("healthy");
  });
});

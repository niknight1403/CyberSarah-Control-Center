import {describe,it,expect} from "vitest";
import {classifyRevenueIncidents} from "../lib/revenue-incident-logic";

describe("revenue incident classifier",()=>{
  it("classifies payment, provider and funnel failures with safe repair actions",()=>{
    const incidents=classifyRevenueIncidents([
      "Stripe-Webhook 4 Fehler in Folge",
      "Alle LLM-Provider-Circuits offen",
      "Funnel-Engpass checkout-upgrade: 70% Drop-off",
      "Cross-Sell-Conversion nur 2.5% bei 40 Empfehlungen",
    ]);
    expect(incidents[0]?.severity).toBe("critical");
    expect(incidents.some(x=>x.code==="REV_PROVIDER_CAPACITY"&&x.autoRepairable)).toBe(true);
    expect(incidents.some(x=>x.code==="REV_FUNNEL_FRICTION"&&x.owner==="sales-conversion-unit")).toBe(true);
    expect(incidents.some(x=>x.code==="REV_CROSS_SELL"&&x.owner==="growth-swarm")).toBe(true);
  });
});

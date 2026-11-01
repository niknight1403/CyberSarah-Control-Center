import {describe,it,expect} from "vitest";
import {buildAiInfluenzaStripeLineItem} from "../lib/ai-influenza-team-logic";

describe("AI Influenza Stripe package mapping",()=>{
  it("uses configured recurring price ids when available",()=>{
    expect(buildAiInfluenzaStripeLineItem("starter",{STRIPE_AI_INFLUENZA_PRICE_ID_STARTER:"price_starter"}))
      .toEqual({price:"price_starter",quantity:1});
  });
  it("falls back to exact monthly package price_data without secrets",()=>{
    const item=buildAiInfluenzaStripeLineItem("growth",{});
    expect("price_data" in item).toBe(true);
    if("price_data" in item){
      expect(item.price_data.unit_amount).toBe(99900);
      expect(item.price_data.recurring.interval).toBe("month");
      expect(item.price_data.product_data.metadata.packageId).toBe("growth");
    }
  });
  it("rejects malformed configured Stripe price ids",()=>{
    expect(()=>buildAiInfluenzaStripeLineItem("business",{STRIPE_AI_INFLUENZA_PRICE_ID_BUSINESS:"2499"})).toThrow(/Stripe-Preis-ID/);
  });
});

import { describe, expect, it } from "vitest";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";
import { reviewProductPriceVariants, reviewProductRights, validateStripeSourceIds, buildSafeProductHooks, buildMediaRightsChecklist, resolveCampaignPersona, mobileCreativeSpec, buildLandingCtaContract } from "../lib/commerce-draft-guards";

const baseProduct = {id:"prod_sample",name:"CyberSarah Paket",active:true,default_price:"price_default"};
const basePrice = {id:"price_default",product:"prod_sample",active:true,currency:"eur",unit_amount:7900,type:"one_time",tax_behavior:"inclusive"};
const catalog = (prices: Array<typeof basePrice>) => projectStripeCatalog([baseProduct],prices,true,true);

describe("Commerce draft release safeguards", () => {
  it("Sprint 22: identifies mixed currency, tax and one-time/recurring variants without claiming validity dates", () => {
    const mixed = catalog([basePrice,{...basePrice,id:"price_other",currency:"usd",tax_behavior:"exclusive",type:"recurring"}]);
    const flags = reviewProductPriceVariants(mixed,"prod_sample");
    expect(flags.some(flag => flag.includes("Währungen"))).toBe(true);
    expect(flags.some(flag => flag.includes("Steuerbehandlungen"))).toBe(true);
    expect(flags.some(flag => flag.includes("Einmalzahlung"))).toBe(true);
    expect(flags.some(flag => flag.includes("Gültigkeit"))).toBe(true);
    expect(reviewProductPriceVariants(catalog([basePrice]),"prod_sample").some(x => x.includes("unterschiedliche Währungen"))).toBe(false);
  });
  it("Sprint 27: Stripe metadata cannot silently mark rights and affiliate disclosures verified", () => {
    const projected=projectStripeCatalog([{...baseProduct,metadata:{rights:"owner_verified",affiliate:"yes"}}],[basePrice],true,true);
    expect(projected.products[0].rightsVerified).toBe(false);
    expect(reviewProductRights(projected.products[0]).some(x=>x.includes("Rechtefreigabe offen"))).toBe(true);
    expect(reviewProductRights(projected.products[0]).some(x=>x.includes("Affiliate-/Werbekennzeichnung offen"))).toBe(true);
  });

  it("Sprint 28: rejects untrusted provider ID formats used in approvals", () => {
    expect(validateStripeSourceIds("prod_sample","price_sample")).toBeNull();
    expect(validateStripeSourceIds("prod_sample","price_../../hack")).toMatch(/Quell-IDs/);
    expect(validateStripeSourceIds("prod_<script>","price_sample")).toMatch(/Quell-IDs/);
    expect(validateStripeSourceIds("prod_sample","price_")).toMatch(/Quell-IDs/);
  });

  it("Sprint 33: generates three different safe hooks without price or success inventions", () => {
    const hooks=buildSafeProductHooks("CyberSarah Paket");
    expect(hooks).toHaveLength(3);
    expect(new Set(hooks).size).toBe(3);
    expect(hooks.every(x=>x.includes("CyberSarah Paket"))).toBe(true);
    expect(hooks.join(" ")).not.toMatch(/garantiert|jetzt kaufen|kostenlos|100 %/i);
  });

  it("Sprint 34: keeps production media render blocked without independent license evidence", () => {
    const p=catalog([basePrice]).products[0];
    const notes=buildMediaRightsChecklist(p);
    expect(notes).toContain("RENDER-STATUS: BLOCKIERT");
    expect(notes).toContain("prod_sample");
    expect(notes).toMatch(/keine Lizenz/);
  });

  it("Sprint 36: uses registered personas and their actual AI disclosure", () => {
    expect(resolveCampaignPersona("nova")?.disclosure).toMatch(/KI-Persönlichkeit/);
    expect(resolveCampaignPersona("juno")?.name).toBe("Juno");
    expect(resolveCampaignPersona("unregistered-persona")).toBeNull();
  });

  it("Sprint 37: gives mobile-first dimensions and safe areas for each allowed platform", () => {
    expect(mobileCreativeSpec("instagram")).toMatchObject({width:1080,height:1920});
    expect(mobileCreativeSpec("tiktok")).toMatchObject({width:1080,height:1920});
    expect(mobileCreativeSpec("linkedin")).toMatchObject({width:1080,height:1080});
    expect(mobileCreativeSpec("rogue-platform")).toBeNull();
  });

  it("Sprint 51: landing checkout CTA is explicitly disabled without independent checkout evidence", () => {
    const cta=buildLandingCtaContract("prod_sample","price_default");
    expect(cta).toMatchObject({enabled:false,destination:null,status:"requires-review"});
    expect(cta.productId).toBe("prod_sample");
    expect(cta.requiredEvidence).toHaveLength(3);
  });

});

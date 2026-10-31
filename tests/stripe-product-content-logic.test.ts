import { describe, expect, it } from "vitest";
import { buildProductContentBrief, PRODUCT_CONTENT_REVIEW } from "../lib/stripe-product-content-logic";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";
const product={ id:"prod_sample",name:"CyberSarah Digitalpaket",active:true,default_price:"price_sample" };
const price={ id:"price_sample", product:"prod_sample", active:true,currency:"eur",unit_amount:7900,
  type:"one_time",tax_behavior:"inclusive" };
const catalog=()=>projectStripeCatalog([product],[price],true,true);
describe("Admin Stripe product -> fully reviewable campaign draft",()=>{
  it("builds Reel/Story/Landingpage in existing editable ContentDraftPayload",()=>{
    const result=buildProductContentBrief(catalog(),"prod_sample","nova","instagram");
    expect(result.ok).toBe(true);
    if(!result.ok)throw Error(result.reason);
    expect(result.payload.assets?.map(a=>a.format)).toEqual([
      "reel-storyboard","landing-outline","story-outline",
    ]);
    expect(result.payload.content).toContain("CyberSarah Digitalpaket");
    const reel = result.payload.assets?.find(asset => asset.format === "reel-storyboard");
    expect(reel?.content).toContain("00–03 s | Sprechertext:");
    expect(reel?.content).toContain("Untertitel:");
    expect(reel?.content).toContain("Dauer: 27 Sekunden");
    expect(reel?.content).toContain("kein gerendertes Video oder Audio");
    expect(result.payload.commerceSource).toEqual({provider:"stripe",productId:"prod_sample",priceId:"price_sample"});
    expect(result.payload.reviewFlags).toEqual(expect.arrayContaining([...PRODUCT_CONTENT_REVIEW]));
    expect(result.payload.content).not.toMatch(/79[.,]00|garantiert|sofort kaufen/i);
  });
  it("refuses incomplete Stripe inventories and active product with missing price",()=>{
    const incomplete=projectStripeCatalog([product],[price],false,true);
    expect(buildProductContentBrief(incomplete,"prod_sample").ok).toBe(false);
    const missing=projectStripeCatalog([product],[],true,true);
    expect(buildProductContentBrief(missing,"prod_sample").ok).toBe(false);
  });
  it("refuses inactive products/prices and unknown external provider names",()=>{
    const inactive=projectStripeCatalog([{...product,active:false}],[price],true,true);
    expect(buildProductContentBrief(inactive,"prod_sample").ok).toBe(false);
    const noPrice=projectStripeCatalog([product],[{...price,active:false}],true,true);
    expect(buildProductContentBrief(noPrice,"prod_sample").ok).toBe(false);
    expect(buildProductContentBrief(catalog(),"prod_other").ok).toBe(false);
    expect(buildProductContentBrief(catalog(),"prod_sample","nova","random-platform").ok).toBe(false);
  });
  it("preserves product quality flags and warns about unverified rights",()=>{
    const source=projectStripeCatalog([{...product,name:"CyberSarah nur heute -20%"}],[price],true,true);
    const result=buildProductContentBrief(source,"prod_sample");
    expect(result.ok).toBe(true);
    if(!result.ok)throw Error(result.reason);
    expect(result.payload.reviewFlags?.some(s=>s.includes("Rabattversprechen"))).toBe(true);
    expect(result.payload.reviewFlags?.some(s=>s.includes("Medien-/Markenrechte"))).toBe(true);
  });
  it("Sprint 23: blocks drafts when upstream Stripe pages contain duplicate IDs", () => {
    const duplicate=projectStripeCatalog([product,product],[price,price],true,true);
    const result=buildProductContentBrief(duplicate,"prod_sample");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Doppelte Stripe/);
  });

});
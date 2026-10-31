import { describe, expect, it } from "vitest";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";
import { reviewProductPriceVariants } from "../lib/commerce-draft-guards";

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
});

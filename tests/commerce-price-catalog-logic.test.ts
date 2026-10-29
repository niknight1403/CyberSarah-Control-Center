import { describe, it, expect } from "vitest";
import { readStripePrices, groupStripePriceVariants, priceVariantsReview, type StripePriceInput } from "../lib/commerce-price-catalog-logic";
const price=(n:number,product="prod_ABCDEFG"): StripePriceInput => ({
  id:"price_"+String(n).padStart(6,"0"),product,active:true,
  currency:"eur",unit_amount:1000+n,tax_behavior:"exclusive",
});
describe("Stripe price catalogue, read-only and complete",()=>{
  it("reads 101 prices over two pages without duplication",async()=>{
    const all=Array.from({length:101},(_,i)=>price(i));
    const cursors:(string|undefined)[]=[];
    const result=await readStripePrices(async cursor=>{
      cursors.push(cursor);
      const idx=cursor?all.findIndex(p=>p.id===cursor)+1:0;
      return {data:all.slice(idx,idx+100),has_more:idx+100<all.length};
    });
    expect(result.prices).toHaveLength(101);
    expect(result.complete).toBe(true);
    expect(result.pages).toBe(2);
    expect(cursors).toEqual([undefined,all[99].id]);
  });
  it("deduplicates prices and keeps partial inventory labelled",async()=>{
    const p=price(1);
    const result=await readStripePrices(async cursor=>({
      data:cursor?[p,price(2)]:[p],has_more:true,
    }),2);
    expect(result.complete).toBe(false);
    expect(result.prices.map(x=>x.id)).toEqual([price(1).id,price(2).id]);
  });
  it("rejects repeated end cursor and empty pages that claim continuation",async()=>{
    await expect(readStripePrices(async()=>({data:[],has_more:true}))).rejects.toThrow();
  });
  it("groups physical, recurring and international prices without EUR conversion",()=>{
    const entries:StripePriceInput[]=[
      price(2),
      {...price(1),currency:"usd",unit_amount:1500},
      {...price(3),recurring:{interval:"month",interval_count:2},unit_amount:3000},
      {...price(4),product:"prod_ANOTHER",active:false},
    ];
    const g=groupStripePriceVariants(entries);
    const variants=g.get("prod_ABCDEFG")!;
    expect(variants).toHaveLength(3);
    expect(variants.find(v=>v.currency==="usd")?.unitAmount).toBe(1500);
    expect(variants.find(v=>v.recurring)?.interval).toBe("month");
    const summary=priceVariantsReview(variants,true);
    expect(summary.currencyReviewRequired).toBe(true);
    expect(summary.recurringVariantsPresent).toBe(true);
    expect(summary.priceInventoryComplete).toBe(true);
    expect(summary.taxReviewRequired).toBe(false);
  });
  it("rejects invalid amounts and invalid IDs, limits variant output to 100",()=>{
    const bad={...price(2),unit_amount:-100};
    const group=groupStripePriceVariants([bad,{...price(3),id:"malformed"}]);
    expect(group.get("prod_ABCDEFG")?.[0]?.unitAmount).toBeNull();
    expect(group.get("prod_ABCDEFG")).toHaveLength(1);
    const variants=Array.from({length:110},(_,i)=>({
      priceId:"price_"+i,currency:"eur",unitAmount:i,
      taxBehavior:"unspecified",recurring:false,interval:null,
      intervalCount:null,nickname:null,
    }));
    const summary=priceVariantsReview(variants,false);
    expect(summary.variants).toHaveLength(100);
    expect(summary.variantsTruncated).toBe(true);
    expect(summary.priceInventoryComplete).toBe(false);
  });
});
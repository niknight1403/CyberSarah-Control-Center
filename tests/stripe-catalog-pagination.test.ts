import { describe, expect, it } from "vitest";
import { collectPages } from "../server/stripe-catalog-readonly";
describe("Sprints 21/29: bounded Stripe pagination with truthful completeness", () => {
  it("reads all pages in order and uses last Stripe id as cursor", async () => {
    const cursors: (string|undefined)[] = [];
    const read = async ({starting_after}: {limit:number;starting_after?:string}) => {
      cursors.push(starting_after);
      return starting_after ? {data: [{id:"prod_b"}],has_more:false}
        : {data:[{id:"prod_a"}],has_more:true};
    };
    const result=await collectPages(read);
    expect(result).toEqual({ rows:[{id:"prod_a"},{id:"prod_b"}],complete:true });
    expect(cursors).toEqual([undefined,"prod_a"]);
  });
  it("never reports completeness after the 5-page safety cap", async () => {
    let page=0;
    const result=await collectPages(async () => ({ data:[{id:"prod_"+(++page)}], has_more:true }));
    expect(result.complete).toBe(false);
    expect(result.rows).toHaveLength(5);
  });
  it("refuses endless cursors that return no next product", async () => {
    const result=await collectPages(async () => ({data:[],has_more:true}));
    expect(result.complete).toBe(false);
  });
  it("refuses malformed response instead of inventing empty catalog", async () => {
    await expect(collectPages(async () => ({data:null,has_more:false} as never))).rejects.toThrow();
  });
  it("marks repeated page boundaries as incomplete to prevent phantom inventory", async () => {
    const result = await collectPages(async ({ starting_after }) => (
      starting_after
        ? { data: [{ id: "prod_a" }, { id: "prod_b" }], has_more: false }
        : { data: [{ id: "prod_a" }], has_more: true }
    ));
    expect(result.complete).toBe(false);
    expect(result.rows).toEqual([{id:"prod_a"}]);
  });
  it("rejects missing pagination flags", async () => {
    await expect(collectPages(async () => ({data:[{id:"prod_a"}]} as never))).rejects.toThrow("Pagination");
  });
  it("rejects invalid Stripe row identifiers and oversized provider pages", async () => {
    await expect(collectPages(async () => ({data:[{id:""}],has_more:false}))).rejects.toThrow("ungueltige");
    await expect(collectPages(async () => ({
      data: Array.from({length:101},(_,i)=>({id:"prod_"+i})),has_more:false
    }))).rejects.toThrow("ungueltige");
  });

});

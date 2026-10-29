import { describe, it, expect } from "vitest";
const fakeKey=(prefix:string,mode:string,suffix:string)=>[prefix,mode,suffix].join("_");
import { mergePersistedRenderEnvVars } from "../lib/render-deploy-logic.mjs";
describe("Render secure persistence for Stripe admin integration",()=>{
  it("preserves Stripe credentials if GitHub sends none",()=>{
    const current=[{envVar:{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","live","example")}},{envVar:{key:"STRIPE_WEBHOOK_SECRET",value:["whsec","existing"].join("_")}},{envVar:{key:"STRIPE_MODE",value:"live"}},{envVar:{key:"DATABASE_URL",value:"postgresql://test"}}];
    const merged=mergePersistedRenderEnvVars(current,[{key:"APP_BASE_URL",value:"https://example.org"},{key:"NODE_ENV",value:"production"}]);
    expect(merged.find(x=>x.key==="STRIPE_SECRET_KEY")?.value).toBe(fakeKey("sk","live","example"));
    expect(merged.find(x=>x.key==="STRIPE_WEBHOOK_SECRET")?.value).toBe(["whsec","existing"].join("_"));
    expect(merged.find(x=>x.key==="DATABASE_URL")?.value).toBe("postgresql://test");
  });
  it("allows intentional rotation of a Stripe key without duplicate rows",()=>{
    const merged=mergePersistedRenderEnvVars([{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","test","old")}],[{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","test","new")}]);
    expect(merged).toEqual([{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","test","new")}]);
  });
  it("does not remove existing secrets when submitted value is blank",()=>{
    const merged=mergePersistedRenderEnvVars([{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","live","keep")}],[{key:"STRIPE_SECRET_KEY",value:""}]);
    expect(merged[0]?.value).toBe(fakeKey("sk","live","keep"));
  });
  it("keeps existing Stripe mode when GitHub has no replacement key",()=>{
    const old=[{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","test","existing")},{key:"STRIPE_MODE",value:"test"}];
    const merged=mergePersistedRenderEnvVars(old,[{key:"STRIPE_MODE",value:"live"},{key:"APP_BASE_URL",value:"https://app.example.org"}]);
    expect(merged.find(x=>x.key==="STRIPE_SECRET_KEY")?.value).toBe(fakeKey("sk","test","existing"));
    expect(merged.find(x=>x.key==="STRIPE_MODE")?.value).toBe("test");
  });
  it("allows explicit key rotation and mode switch together",()=>{
    const old=[{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","test","existing")},{key:"STRIPE_MODE",value:"test"}];
    const merged=mergePersistedRenderEnvVars(old,[{key:"STRIPE_SECRET_KEY",value:fakeKey("sk","live","new")},{key:"STRIPE_MODE",value:"live"}]);
    expect(merged.find(x=>x.key==="STRIPE_MODE")?.value).toBe("live");
  });
  it("refuses missing or redacted Render ENV data",()=>{
    expect(()=>mergePersistedRenderEnvVars(null,[])).toThrow();
    expect(()=>mergePersistedRenderEnvVars([{envVar:{key:"STRIPE_SECRET_KEY",value:"********"}}],[])).toThrow();
  });
});
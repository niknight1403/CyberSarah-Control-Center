import { describe, it, expect } from "vitest";
import { mergePersistedRenderEnvVars } from "../lib/render-deploy-logic.mjs";
describe("Render secure persistence for Stripe admin integration",()=>{
  it("preserves Stripe credentials if GitHub sends none",()=>{
    const current=[{envVar:{key:"STRIPE_SECRET_KEY",value:"sk_live_example"}},{envVar:{key:"STRIPE_WEBHOOK_SECRET",value:"whsec_existing"}},{envVar:{key:"STRIPE_MODE",value:"live"}},{envVar:{key:"DATABASE_URL",value:"postgresql://test"}}];
    const merged=mergePersistedRenderEnvVars(current,[{key:"APP_BASE_URL",value:"https://example.org"},{key:"NODE_ENV",value:"production"}]);
    expect(merged.find(x=>x.key==="STRIPE_SECRET_KEY")?.value).toBe("sk_live_example");
    expect(merged.find(x=>x.key==="STRIPE_WEBHOOK_SECRET")?.value).toBe("whsec_existing");
    expect(merged.find(x=>x.key==="DATABASE_URL")?.value).toBe("postgresql://test");
  });
  it("allows intentional rotation of a Stripe key without duplicate rows",()=>{
    const merged=mergePersistedRenderEnvVars([{key:"STRIPE_SECRET_KEY",value:"sk_test_old"}],[{key:"STRIPE_SECRET_KEY",value:"sk_test_new"}]);
    expect(merged).toEqual([{key:"STRIPE_SECRET_KEY",value:"sk_test_new"}]);
  });
  it("does not remove existing secrets when submitted value is blank",()=>{
    const merged=mergePersistedRenderEnvVars([{key:"STRIPE_SECRET_KEY",value:"sk_live_keep"}],[{key:"STRIPE_SECRET_KEY",value:""}]);
    expect(merged[0]?.value).toBe("sk_live_keep");
  });
  it("refuses missing or redacted Render ENV data",()=>{
    expect(()=>mergePersistedRenderEnvVars(null,[])).toThrow();
    expect(()=>mergePersistedRenderEnvVars([{envVar:{key:"STRIPE_SECRET_KEY",value:"********"}}],[])).toThrow();
  });
});
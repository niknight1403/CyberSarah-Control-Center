import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveDigistore24IpnSecret } from "../lib/digistore24-ipn-config";

describe("Digistore24 production wiring",()=>{
  it("prefers the canonical IPN secret",()=>{
    expect(resolveDigistore24IpnSecret({
      DIGISTORE24_IPN_SECRET:" canonical ",
      DIGISTORE24_IPN_PASSPHRASE:"legacy",
    })).toBe("canonical");
  });
  it("supports the legacy passphrase alias",()=>{
    expect(resolveDigistore24IpnSecret({DIGISTORE24_IPN_PASSPHRASE:" legacy "})).toBe("legacy");
  });
  it("stays fail-closed when no IPN secret exists",()=>{
    expect(resolveDigistore24IpnSecret({})).toBeUndefined();
  });
  it("forwards only health-gated Digistore values into Render",()=>{
    const deploy=readFileSync("scripts/render-deploy.mjs","utf8");
    const workflow=readFileSync(".github/workflows/render-deploy.yml","utf8");
    expect(deploy).toContain('"DIGISTORE24_API_KEY"');
    expect(deploy).toContain('"DIGISTORE24_IPN_SECRET"');
    expect(workflow).toContain("DIGISTORE24_API_KEY=$D24_API_KEY");
    expect(workflow).toContain("QUARANTINED");
    expect(workflow).toContain("https://www.digistore24.com/api/call/ping");
  });
});

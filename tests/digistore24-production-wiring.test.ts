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
    const guard=readFileSync("scripts/digistore24-deploy-guard.mjs","utf8");
    expect(workflow).toContain("node scripts/digistore24-deploy-guard.mjs");
    expect(guard).toContain('appendEnv("DIGISTORE24_API_KEY",apiKey)');
    expect(guard).toContain("INVALID_KEY_QUARANTINED");
    expect(guard).toContain("D24_PROBE_UNAVAILABLE");
    expect(guard).toContain("https://www.digistore24.com/api/call/listCommissions");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveDigistore24IpnSecret,
  resolveDigistore24IpnSecrets,
  ipnSecretFingerprint,
} from "../lib/digistore24-ipn-config";

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

describe("Digistore24 IPN: Passphrasen-Rotation", () => {
  it("liest mehrere Kandidaten aus einer kommagetrennten Liste", () => {
    expect(resolveDigistore24IpnSecrets({ DIGISTORE24_IPN_SECRET: " a , b;c\nd " })).toEqual(["a", "b", "c", "d"]);
  });
  it("entfernt Duplikate und leere Eintraege", () => {
    expect(resolveDigistore24IpnSecrets({ DIGISTORE24_IPN_SECRET: "x,,x; " })).toEqual(["x"]);
  });
  it("bevorzugt das kanonische Secret vor dem Alias", () => {
    expect(resolveDigistore24IpnSecrets({ DIGISTORE24_IPN_SECRET: "neu", DIGISTORE24_IPN_PASSPHRASE: "alt" })).toEqual(["neu"]);
  });
  it("liefert ohne Konfiguration eine leere Liste", () => {
    expect(resolveDigistore24IpnSecrets({})).toEqual([]);
  });
  it("Fingerabdruck ist stabil und verraet das Geheimnis nicht", () => {
    const fingerprint = ipnSecretFingerprint("Passphrase-1");
    expect(fingerprint).toHaveLength(8);
    expect(fingerprint).toBe(ipnSecretFingerprint("Passphrase-1"));
    expect(fingerprint).not.toBe(ipnSecretFingerprint("Passphrase-2"));
    expect(fingerprint).not.toContain("Passphrase");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_ALLOWED_ORIGINS, resolveAllowedOrigins } from "../lib/allowed-origins-logic";

describe("allowed-origins-logic", () => {
  it("erlaubt Capacitor-Origins standardmaessig (APK-Auth-Fix)", () => {
    const origins = resolveAllowedOrigins({ configuredRaw: "" });
    expect(origins.has("https://localhost")).toBe(true);
    expect(origins.has("capacitor://localhost")).toBe(true);
  });

  it("vereinigt konfigurierte Origins mit den Standard-Urspruengen", () => {
    const origins = resolveAllowedOrigins({ configuredRaw: "https://app.cybersarah-ki.com, https://cms.example.com" });
    expect(origins.has("https://app.cybersarah-ki.com")).toBe(true);
    expect(origins.has("https://cms.example.com")).toBe(true);
    expect(origins.has("https://localhost")).toBe(true);
  });

  it("ignoriert leere und whitespace-Eintraege", () => {
    const origins = resolveAllowedOrigins({ configuredRaw: " , ,https://a.example , " });
    expect(origins.has("")).toBe(false);
    expect(origins.has("https://a.example")).toBe(true);
  });

  it("enthaelt die Dev-Origins in Nicht-Produktionsumgebungen", () => {
    const origins = resolveAllowedOrigins({ configuredRaw: "", isProduction: false });
    expect(origins.has("http://localhost:8081")).toBe(true);
    expect(DEFAULT_ALLOWED_ORIGINS.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { getCapabilityCatalog, summarizeCapabilityCatalog } from "../lib/capability-catalog";

describe("central capability catalog", () => {
  it("recognizes any-of provider key slots without exposing values", () => {
    const item = getCapabilityCatalog({ GROQ_API_KEY: "secret-value" }).find((entry) => entry.id === "llm-groq");
    expect(item?.configuration).toBe("configured");
    expect(item?.configuredEnv).toEqual(["GROQ_API_KEY"]);
    expect(JSON.stringify(item)).not.toContain("secret-value");
  });

  it("distinguishes built-in availability from verified health", () => {
    const tts = getCapabilityCatalog({}).find((entry) => entry.id === "tts-edge");
    expect(tts?.configuration).toBe("available");
    expect(tts?.health).toBe("not_checked");
    expect(tts?.lastChecked).toBeNull();
  });

  it("reports partial credentials and missing any-of slot honestly", () => {
    const item = getCapabilityCatalog({ GA4_PROPERTY_ID: "123" }).find((entry) => entry.id === "analytics-ga4");
    expect(item?.configuration).toBe("partial");
    expect(item?.missingEnv).toContain("GA4_ACCESS_TOKEN");
  });

  it("keeps all unprobed integrations explicitly unverified", () => {
    const statuses = getCapabilityCatalog({});
    expect(statuses.length).toBeGreaterThanOrEqual(20);
    expect(statuses.every((entry) => entry.health === "not_checked")).toBe(true);
    expect(summarizeCapabilityCatalog(statuses).healthVerified).toBe(0);
  });
});

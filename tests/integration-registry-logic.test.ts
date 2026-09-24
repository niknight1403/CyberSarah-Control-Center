import { describe, expect, it } from "vitest";

import { getAllIntegrationStatuses, getIntegrationStatus, readinessLabel, summarizeReadiness } from "../lib/integration-registry-logic";

describe("integration registry (Sprint 263)", () => {
  const fullEnv = {
    STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "wh_x", STRIPE_PUBLISHABLE_KEY: "pk_x",
    RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "a@b.de",
    ADMIN_GITHUB_TOKEN: "gh_x", HF_TOKEN: "hf_x",
    DIGISTORE24_API_KEY: "d_x", DIGISTORE24_IPN_SECRET: "i_x",
    TIKTOK_CLIENT_KEY: "t", TIKTOK_CLIENT_SECRET: "s", TIKTOK_ACCESS_TOKEN: "a",
    META_APP_ID: "m", META_APP_SECRET: "s", META_ACCESS_TOKEN: "a", META_VERIFY_TOKEN: "v",
  };

  it("bewertet vollstaendige Konfiguration als bereit", () => {
    const stripe = getIntegrationStatus("stripe", fullEnv);
    expect(stripe?.readiness).toBe("ready");
    expect(stripe?.missingEnv).toEqual([]);
  });

  it("erkennt teilweise und fehlende Konfiguration ehrlich", () => {
    const partial = getIntegrationStatus("resend", { RESEND_API_KEY: "nur-ein-key" });
    expect(partial?.readiness).toBe("partial");
    expect(partial?.missingEnv).toEqual(["RESEND_FROM_EMAIL"]);
    const none = getIntegrationStatus("huggingface", {});
    expect(none?.readiness).toBe("not_configured");
    expect(readinessLabel("not_configured")).toBe("nicht konfiguriert");
    expect(getIntegrationStatus("stripe", {})?.missingEnv).toContain("STRIPE_SECRET_KEY");
  });

  it("jede Integration hat eine harte Ausfuehrungs-Grenze", () => {
    for (const status of getAllIntegrationStatuses(fullEnv)) {
      expect(status.executionBoundary.length).toBeGreaterThan(20);
      expect(status.capabilities.length).toBeGreaterThan(0);
      expect(status.requiredEnv.length).toBeGreaterThan(0);
    }
  });

  it("Zusammenfassung nennt bereit und fehlend ohne Schoenung", () => {
    const summary = summarizeReadiness(getAllIntegrationStatuses(fullEnv));
    expect(summary).toContain("Bereit:");
    expect(summary).not.toContain("Fehlt");
    const empty = summarizeReadiness(getAllIntegrationStatuses({}));
    expect(empty).toContain("Keine Integration vollstaendig konfiguriert.");
    expect(empty).toContain("Fehlt/teilweise:");
  });

  it("unbekannte Keys sind null statt geraten", () => {
    expect(getIntegrationStatus("nichtda" as never, fullEnv)).toBeNull();
  });
});

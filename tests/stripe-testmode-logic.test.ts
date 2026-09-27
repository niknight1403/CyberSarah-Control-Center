import { describe, it, expect } from "vitest";
import {
  detectStripeMode,
  modeBadgeLabel,
  revenueGuardForMode,
  checkoutDisclaimer,
} from "@/lib/stripe-testmode-logic";

describe("Sprint 319 — Stripe-Testmodus-Kennzeichnung", () => {
  it("erkennt Modus am Key-Praefix", () => {
    expect(detectStripeMode("sk_test_abc")).toBe("test");
    expect(detectStripeMode("rk_test_abc")).toBe("test");
    expect(detectStripeMode("sk_live_abc")).toBe("live");
    expect(detectStripeMode("  ")).toBe("nicht-konfiguriert");
    expect(detectStripeMode(null)).toBe("nicht-konfiguriert");
    expect(detectStripeMode("was-auch-immer")).toBe("nicht-konfiguriert");
  });

  it("Badge nennt Test-Modus laut und unmissverstaendlich", () => {
    expect(modeBadgeLabel("test")).toContain("TEST-MODUS");
    expect(modeBadgeLabel("test")).toContain("keine echten Zahlungen");
    expect(modeBadgeLabel("live")).toContain("Live-Modus");
    expect(modeBadgeLabel("nicht-konfiguriert")).toContain("nicht konfiguriert");
  });

  it("Test-Zahlungen zaehlen NIE als Umsatz", () => {
    expect(revenueGuardForMode("test").countsAsRevenue).toBe(false);
    expect(revenueGuardForMode("test").hint).toContain("NICHT");
    expect(revenueGuardForMode("live").countsAsRevenue).toBe(true);
    expect(revenueGuardForMode("nicht-konfiguriert").countsAsRevenue).toBe(false);
  });

  it("Checkout-Disclaimer nur im Test-Modus", () => {
    expect(checkoutDisclaimer("test")).toContain("Test-Checkout");
    expect(checkoutDisclaimer("live")).toBeNull();
  });
});

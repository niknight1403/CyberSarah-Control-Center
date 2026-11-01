import { describe, it, expect } from "vitest";
import {
  decideUpgradePrompt,
  nextUpgradeTier,
  recordDismissal,
  parseTierOrFallback,
  UPGRADE_PROMPT_LIMITS,
} from "@/lib/upgrade-prompt-ui-logic";

const ctx = (over: Record<string, unknown> = {}) => ({
  featureLabel: "KI-Chat",
  currentTier: "lite" as const,
  used: 45,
  limit: 50,
  dismissalsToday: 0,
  ...over,
});

describe("Sprint 315 — Upgrade-Prompt (UI-Schicht)", () => {
  it("zeigt erst ab 90 % Verbrauch", () => {
    expect(decideUpgradePrompt(ctx({ used: 30, limit: 50 })).show).toBe(false);
    expect(decideUpgradePrompt(ctx({ used: 44, limit: 50 })).show).toBe(false);
    expect(decideUpgradePrompt(ctx({ used: 45, limit: 50 })).show).toBe(true);
  });

  it("ungueltige Limits werden nie verwertet", () => {
    expect(decideUpgradePrompt(ctx({ limit: 0 })).show).toBe(false);
  });

  it("bleibt weg nach einmaligem Verwerfen (kein Nerven)", () => {
    const once = decideUpgradePrompt(ctx({ dismissalsToday: 1 }));
    expect(once.show).toBe(false);
    if (!once.show) expect(once.reason).toBe("bereits verworfen");
    expect(UPGRADE_PROMPT_LIMITS.maxDismissalsPerDay).toBe(1);
  });

  it("nennt Restkontingent und naechsten Tier ohne Druck", () => {
    const d = decideUpgradePrompt(ctx());
    expect(d.show).toBe(true);
    if (d.show) {
      expect(d.body).toContain("5 von 50");
      expect(d.body).toContain("kein Zeitdruck");
      expect(d.ctaLabel).toContain("pro");
    }
  });

  it("hoechster Tier bekommt keinen Upgrade-CTA", () => {
    const d = decideUpgradePrompt(ctx({ currentTier: "expert" }));
    expect(d.show).toBe(true);
    if (d.show) {
      expect(d.ctaLabel).toBe("Tiers ansehen");
      expect(d.body).toContain("höchsten Tier");
    }
    expect(nextUpgradeTier("expert")).toBeNull();
    expect(nextUpgradeTier("lite")).toBe("pro");
  });

  it("recordDismissal zaehlt, parseTierOrFallback faellt auf lite", () => {
    expect(recordDismissal(0)).toBe(1);
    expect(parseTierOrFallback("expert")).toBe("expert");
    expect(parseTierOrFallback("hax")).toBe("lite");
  });
});

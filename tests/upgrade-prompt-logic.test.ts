import { describe, expect, it } from "vitest";

import { SOFT_WARNING_RATIO, buildQuotaUpgradePrompt } from "../lib/upgrade-prompt-logic";

describe("upgrade prompt logic (Sprint 262)", () => {
  const gate = { usedToday: 0, dailyLimit: 50, resetsAt: "2026-09-25T00:00:00.000Z", plan: "free" as const, quotaExempt: false };

  it("blockiert ehrlich mit Zahlen und Reset-Zeitpunkt", () => {
    const result = buildQuotaUpgradePrompt({ ...gate, usedToday: 50 }, () => true);
    expect(result.level).toBe("blocked");
    expect(result.prompt?.headline).toBe("Tageslimit erreicht");
    expect(result.prompt?.detail).toContain("50 von 50");
    expect(result.prompt?.detail).toContain("2026-09-25T00:00:00.000Z");
    expect(result.prompt?.urgency).toBe(false);
    expect(result.prompt?.cta).toEqual({ tier: "lite", action: "checkout" });
  });

  it("ohne konfigurierten Preis bleibt der CTA ehrlich wait", () => {
    const result = buildQuotaUpgradePrompt({ ...gate, usedToday: 50 }, () => false);
    expect(result.prompt?.cta).toEqual({ tier: null, action: "wait" });
    expect(result.prompt?.detail).toContain("nicht konfiguriert");
  });

  it("warnt weich ab 80% Verbrauch ohne Checkout-Druck", () => {
    expect(SOFT_WARNING_RATIO).toBe(0.8);
    const result = buildQuotaUpgradePrompt({ ...gate, usedToday: 40 }, () => true);
    expect(result.level).toBe("soft");
    expect(result.prompt?.cta.action).toBe("wait");
    expect(result.prompt?.detail).toContain("Noch 10 von 50");
    const earlier = buildQuotaUpgradePrompt({ ...gate, usedToday: 39 }, () => true);
    expect(earlier.level).toBe("ok");
  });

  it("Admins (quotaExempt) sehen nie einen Prompt", () => {
    const result = buildQuotaUpgradePrompt({ ...gate, usedToday: 999, quotaExempt: true }, () => true);
    expect(result.level).toBe("ok");
    expect(result.prompt).toBeNull();
  });

  it("Empfohlene Nachfolge-Plaene stimmen je Ebene", () => {
    expect(buildQuotaUpgradePrompt({ ...gate, usedToday: 50, plan: "lite" }, () => true).prompt?.cta).toEqual({ tier: "pro", action: "checkout" });
    expect(buildQuotaUpgradePrompt({ ...gate, usedToday: 50, plan: "pro" }, () => true).prompt?.cta).toEqual({ tier: "expert", action: "checkout" });
    expect(buildQuotaUpgradePrompt({ ...gate, usedToday: 50, plan: "expert" }, () => true).prompt?.cta.action).toBe("wait");
  });
});

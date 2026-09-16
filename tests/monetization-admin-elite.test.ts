import { describe, expect, it } from "vitest";

import {
  consumeQuota,
  ensureAdminElitePlan,
  freshAccountState,
  PLAN_LIMITS,
  checkQuota,
  type MonetizationAccountState,
} from "@/lib/monetization-logic";

describe("Sprint 144 — Dauerhafte Admin-Elite-Garantie", () => {
  it("hebt ein Admin-Konto dauerhaft auf das Expert-Paket", () => {
    const free = freshAccountState();
    expect(free.plan).toBe("free");
    const elite = ensureAdminElitePlan(free);
    expect(elite.plan).toBe("expert");
    expect(elite.adminGuaranteed).toBe(true);
  });

  it("ist idempotent — wiederholtes Anwenden veraendert nichts", () => {
    const elite = ensureAdminElitePlan(freshAccountState());
    expect(ensureAdminElitePlan(elite)).toBe(elite);
  });

  it("laesst Admin-Quotas unbegrenzt zu — selbst weit ueber Expert-Limits", () => {
    const elite = ensureAdminElitePlan(freshAccountState());
    const decision = checkQuota(elite, PLAN_LIMITS.expert.monthlyCloudTokens * 100);
    expect(decision.allowed).toBe(true);
    expect(decision.limitKind).toBe("none");
    expect(decision.usesCredits).toBe(false);
  });

  it("blockiert weiterhin normaler Nutzer (Guard gegen Regression)", () => {
    const free = freshAccountState();
    const decision = checkQuota(free, PLAN_LIMITS.free.dailyCloudTokens + 1);
    expect(decision.allowed).toBe(false);
  });

  it("ueberlebt Verbrauchs-Verbuchung: Admin wird nur gezaehlt, nie gedrosselt", () => {
    let elite = ensureAdminElitePlan(freshAccountState());
    elite = consumeQuota(elite, PLAN_LIMITS.expert.dailyCloudTokens + 50_000);
    expect(checkQuota(elite, 1_000_000).allowed).toBe(true);
  });

  it("ueberlebt Periodenwechsel (rollPeriods) ohne Flag-Verlust", () => {
    const state: MonetizationAccountState = {
      ...ensureAdminElitePlan(freshAccountState()),
      dayKey: "2000-01-01",
      dayCloudTokens: 500_000,
      monthKey: "2000-01",
      monthCloudTokens: 5_000_000,
    };
    const decision = checkQuota(state, 999_999);
    expect(decision.allowed).toBe(true);
    expect(state.plan).toBe("expert");
  });

  it("zahlt Admin-Guthaben nie an (usesCredits immer false)", () => {
    const elite = {
      ...ensureAdminElitePlan(freshAccountState()),
      creditBalanceTokens: 100,
      dayCloudTokens: Number.MAX_SAFE_INTEGER,
    };
    const decision = checkQuota(elite, 1_000);
    expect(decision.usesCredits).toBe(false);
  });
});

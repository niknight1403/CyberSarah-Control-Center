/**
 * Sprint 371 — revenue-Router: verdaechtige Metrik-Schiene.
 *
 * getMetrics kombiniert zwei ehrliche Quellen:
 *  1. Kontometrie des Control Centers (Plan, Verbrauch, Credit-Balance,
 *     Enforcement-Modus) — fuer den angemeldeten Nutzer, identisch zur
 *     Monetization-Logik (Sprint 144 Admin-Elite-Garantie bleibt wirksam).
 *  2. Revenue-OS-Snapshot (read-only Schwestern-DB) — NUR fuer Admins;
 *     ohne REVENUE_OS_DATABASE_URL liefert fetchRevenueOsSnapshot den
 *     klaren not-configured-Zustand, ohne Fake-Zahlen.
 */
import { protectedProcedure, router } from "./_core/trpc";
import { getMonetizationAccount, resolvePlanForUser } from "./monetization";
import { PLAN_LIMITS } from "../lib/monetization-logic";
import { fetchRevenueOsSnapshot } from "./revenue-os";

export const revenueRouter = router({
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === "admin";
    const [state, plan] = await Promise.all([
      getMonetizationAccount(ctx.user.openId, { isAdmin }),
      isAdmin ? Promise.resolve("expert" as const) : resolvePlanForUser(ctx.user.id),
    ]);
    const limits = PLAN_LIMITS[plan];
    const account = {
      plan,
      planLabel: limits.label,
      limits,
      usage: {
        todayTokens: state.dayCloudTokens,
        monthTokens: state.monthCloudTokens,
        creditBalanceTokens: state.creditBalanceTokens,
      },
      enforcement: process.env.QUOTA_ENFORCEMENT === "enforce" ? ("enforce" as const) : ("monitor" as const),
    };
    if (!isAdmin) {
      // Schwester-DB-Umsaetze sind Betriebsdaten — nur Admins sehen sie.
      return { account, revenueOs: null };
    }
    const revenueOs = await fetchRevenueOsSnapshot();
    return { account, revenueOs };
  }),
});

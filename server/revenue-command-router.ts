/** Zentral registrierte, authentifizierte Revenue-Router für die App. */
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { haraOverview, saasOverview, subscriptionsOverview, crossSellOverview, expansionOverview, tradingOverview, triggerRevenueScan } from "./revenue-command-service";

export const haraRouter = router({ overview: adminProcedure.query(haraOverview), scan: adminProcedure.mutation(() => triggerRevenueScan("hara/scan")) });
export const saasRouter = router({ overview: adminProcedure.query(saasOverview) });
export const crossSellRouter = router({ overview: adminProcedure.query(crossSellOverview) });
export const expansionRouter = router({ overview: adminProcedure.query(expansionOverview), scan: adminProcedure.mutation(() => triggerRevenueScan("expansion/scan")) });
export const subscriptionManagementRouter = router({ overview: adminProcedure.query(subscriptionsOverview) });
export const revenueTradingRouter = router({ overview: protectedProcedure.query(tradingOverview) });

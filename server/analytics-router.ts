import { z } from "zod";

import { ANALYTICS_EVENT_KINDS } from "../lib/analytics-logic";
import { getFunnelSummary, recordEvent } from "./analytics-service";
import { publicProcedure, router } from "./_core/trpc";

export const analyticsRouter = router({
  track: publicProcedure.input(z.object({ kind: z.enum(ANALYTICS_EVENT_KINDS) })).mutation(async ({ input }) => {
    return recordEvent(input.kind);
  }),
  funnel: publicProcedure.query(async () => {
    return getFunnelSummary();
  }),
});

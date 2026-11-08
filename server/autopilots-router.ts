/**
 * tRPC-Router `autopilots` — Uebersicht aller Automatik-Laeufe und wo weitere
 * sinnvoll waeren. Reine Beschreibung des Code-Stands: keine Laufzeitdaten,
 * keine Behauptung, dass etwas laeuft, das nicht verdrahtet ist.
 */
import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import { autopilotsByStatus, buildAutopilotOverview } from "../lib/autopilot-registry-logic";

export const autopilotsRouter = router({
  overview: protectedProcedure.query(() => buildAutopilotOverview()),
  byStatus: protectedProcedure
    .input(z.object({ status: z.enum(["active", "recommended", "not-useful"]) }))
    .query(({ input }) => ({ status: input.status, autopilots: autopilotsByStatus(input.status) })),
});

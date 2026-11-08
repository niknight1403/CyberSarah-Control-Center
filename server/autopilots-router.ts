/**
 * tRPC-Router `autopilots` — Uebersicht aller Automatik-Laeufe und wo weitere
 * sinnvoll waeren. Reine Beschreibung des Code-Stands: keine Laufzeitdaten,
 * keine Behauptung, dass etwas laeuft, das nicht verdrahtet ist.
 */
import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import {
  autopilotsByStatus,
  buildAutopilotOverview,
  validateAutopilotCatalog,
} from "../lib/autopilot-registry-logic";

export const autopilotsRouter = router({
  overview: protectedProcedure.query(() => buildAutopilotOverview()),
  /** Katalog gegen seine eigenen Regeln — leere Liste heisst konsistent. */
  validate: protectedProcedure.query(() => {
    const issues = validateAutopilotCatalog();
    return { ok: issues.length === 0, issues };
  }),
  byStatus: protectedProcedure
    .input(z.object({ status: z.enum(["active", "recommended", "not-useful"]) }))
    .query(({ input }) => ({ status: input.status, autopilots: autopilotsByStatus(input.status) })),
});

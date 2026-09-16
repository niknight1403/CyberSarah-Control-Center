/**
 * Sprint 113 — Memory-Router: Admin-Sicht auf den Learning-Bestand und
 * manueller Konsolidierungs-Trigger. Tokenfreie Meldungen, Admin-geschuetzt
 * (Standardnutzer erhalten keine Learning-Telemetrie). Der naechtliche Lauf
 * erfolgt ueber .github/workflows/memory-consolidation.yml (cron) mit dem
 *selben Kern in server/memory-consolidation.ts.
 */
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { runMemoryConsolidation } from "./memory-consolidation";
import { getRetrievalMetrics } from "./retrieval-metrics";
import { getLastMemoryConsolidation , listAllAgentLearningsForConsolidation } from "./db";

export const memoryRouter = router({
  /** Bestands- und Lauf-Metriken fuer die Admin-Kachel. */
  overview: adminProcedure.query(async () => {
    let totalLearnings = 0;
    let dbAvailable = true;
    try {
      totalLearnings = (await listAllAgentLearningsForConsolidation(20_000)).length;
    } catch {
      dbAvailable = false;
    }
    const last = dbAvailable ? await getLastMemoryConsolidation() : null;
    const retrieval = getRetrievalMetrics();
    return {
      dbAvailable,
      totalLearnings,
      lastConsolidation: last
        ? {
            trigger: last.trigger,
            summary: last.summary,
            inputCount: last.inputCount,
            survivorCount: last.survivorCount,
            mergedAway: last.mergedAway,
            invalidated: last.invalidated,
            contradictionCount: last.contradictionCount,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      retrieval: {
        samples: retrieval.samples,
        hitRatePct: retrieval.hitRatePct,
        avgInjections: retrieval.avgInjections,
      },
    };
  }),

  /** Konsolidierung manuell anstossen (dryRun=true: nur Vorschau). */
  consolidate: adminProcedure
    .input(z.object({ dryRun: z.boolean().optional() }).optional())
    .mutation(async ({ input }) => runMemoryConsolidation("admin", { dryRun: input?.dryRun ?? false })),
});

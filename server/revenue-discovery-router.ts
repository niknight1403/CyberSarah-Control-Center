/**
 * tRPC-Router `revenueDiscovery` — der Agent, der nach neuen oder
 * integrierbaren Umsatzwegen sucht.
 *
 * Lesen: jeder angemeldete Nutzer. Schreiben (Entwuerfe anlegen): nur Admin,
 * und ohne `dryRun: false` passiert gar nichts. Der Agent legt ausschliesslich
 * Ideen-Entwuerfe an — Produkte, Preise, Kampagnen und Erstansprachen bleiben
 * Freigabe-Sache.
 */
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { previewRevenueDiscovery, runRevenueDiscovery, type DiscoveryDeps } from "./revenue-discovery-service";
import {
  DISCOVERY_SOURCES,
  DISCOVERY_VERDICT_LABELS,
  DISCOVERY_WEIGHTS,
  scoreOpportunity,
  type OpportunitySignals,
} from "../lib/revenue-discovery-logic";

const signalsSchema = z.object({
  demand: z.number().min(0).max(100),
  fit: z.number().min(0).max(100),
  margin: z.number().min(0).max(100),
  ease: z.number().min(0).max(100),
  safety: z.number().min(0).max(100),
});

export type RevenueDiscoveryRouterDeps = {
  preview?: typeof previewRevenueDiscovery;
  run?: typeof runRevenueDiscovery;
};

export function createRevenueDiscoveryRouter(deps: RevenueDiscoveryRouterDeps = {}) {
  const preview = deps.preview ?? previewRevenueDiscovery;
  const run = deps.run ?? runRevenueDiscovery;

  return router({
    /** Woher der Agent seine Signale nimmt und was er daraus ableitet. */
    sources: protectedProcedure.query(() => ({
      sources: DISCOVERY_SOURCES,
      weights: DISCOVERY_WEIGHTS,
      labels: DISCOVERY_VERDICT_LABELS,
    })),

    /** Bewertete Kandidaten — ohne Schreibzugriff. */
    candidates: protectedProcedure.query(async () => {
      const { plan, sources } = await preview();
      return {
        periodKey: plan.periodKey,
        evaluated: sources,
        integrate: plan.integrate,
        test: plan.test,
        review: plan.review,
        skip: plan.skip.slice(0, 10),
        toDraft: plan.toDraft,
      };
    }),

    /** Einzelne Idee durchrechnen: was wuerde die Bewertung sagen? */
    score: protectedProcedure
      .input(z.object({ signals: signalsSchema, evidenceComplete: z.boolean().optional() }))
      .query(({ input }) => scoreOpportunity(input.signals as OpportunitySignals, input.evidenceComplete ?? true)),

    /** Lauf starten. Default ist der Trockenlauf. */
    run: adminProcedure
      .input(z.object({ dryRun: z.boolean().optional() }).optional())
      .mutation(async ({ input }) => {
        const dryRun = input?.dryRun ?? true;
        const result = await (run as (deps?: DiscoveryDeps) => ReturnType<typeof runRevenueDiscovery>)({ dryRunWrite: dryRun });
        return result;
      }),
  });
}

/** Produktions-Instanz fuer den App-Router. */
export const revenueDiscoveryRouter = createRevenueDiscoveryRouter();

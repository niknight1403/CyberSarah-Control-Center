/**
 * Sprint 263 — Oeffentliche Integrations-Status-Abfrage (nur Labels,
 * Readiness und fehlende ENV-Namen — niemals Werte).
 */
import { z } from "zod";

import { getAllIntegrationStatuses, getIntegrationStatus, readinessLabel, summarizeReadiness } from "../lib/integration-registry-logic";
import { publicProcedure, router } from "./_core/trpc";

export const integrationsRouter = router({
  list: publicProcedure.query(() => {
    const statuses = getAllIntegrationStatuses();
    return {
      summary: summarizeReadiness(statuses),
      statuses: statuses.map((status) => ({
        key: status.key,
        label: status.label,
        readiness: status.readiness,
        readinessLabel: readinessLabel(status.readiness),
        missingEnv: status.missingEnv,
        capabilities: status.capabilities,
        executionBoundary: status.executionBoundary,
      })),
    };
  }),
  get: publicProcedure.input(z.object({ key: z.string() })).query(({ input }) => {
    const status = getIntegrationStatus(input.key as Parameters<typeof getIntegrationStatus>[0]);
    if (!status) return null;
    return { key: status.key, label: status.label, readiness: status.readiness, readinessLabel: readinessLabel(status.readiness), missingEnv: status.missingEnv, executionBoundary: status.executionBoundary };
  }),
});

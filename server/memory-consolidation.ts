/**
 * Sprint 113 — Memory-Konsolidierung (Server-Orchestrierung): laedt den
 * Learning-Bestand, baut den Plan ueber die reine Logik in
 * lib/agent-memory-consolidation-logic.ts, wendet ihn auf die Datenbank an
 * und protokolliert den Lauf inklusive Retrieval-Metriken. Ausloeser:
 * taeglicher Workflow (cron) oder Admin (tRPC memory.consolidate).
 */
import {
  buildConsolidationPlan,
  formatConsolidationSummary,
  type ConsolidationLearning,
} from "../lib/agent-memory-consolidation-logic";
import {
  applyConsolidationPlanWrites,
  insertMemoryConsolidationRecord,
  listAllAgentLearningsForConsolidation,
} from "./db";
import { getRetrievalMetrics } from "./retrieval-metrics";

export type MemoryConsolidationTrigger = "cron" | "admin";

export type MemoryConsolidationResult = {
  summary: string;
  stats: {
    input: number;
    survivors: number;
    mergedAway: number;
    invalidated: number;
    contradictionCount: number;
    dedupRatePct: number;
  };
  retrieval: { samples: number; hitRatePct: number; avgInjections: number };
  applied: boolean;
};

/**
 * Fuehrt eine Konsolidierung aus. dryRun=true prueft nur (Admin-Vorschau),
 * ohne Schreibzugriffe. Bei Datenbankproblemen wird ehrlich geworfen —
 * niemals stillschweigend "erfolgreich".
 */
export async function runMemoryConsolidation(
  trigger: MemoryConsolidationTrigger,
  options: { dryRun?: boolean } = {},
): Promise<MemoryConsolidationResult> {
  const rows = await listAllAgentLearningsForConsolidation();
  const learnings: ConsolidationLearning[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    keywords: row.keywords,
    createdAt: row.createdAt.getTime(),
  }));

  const plan = buildConsolidationPlan(learnings, { now: Date.now() });
  const summary = formatConsolidationSummary(plan, trigger);
  const retrieval = getRetrievalMetrics();

  if (!options.dryRun) {
    await applyConsolidationPlanWrites(plan);
    await insertMemoryConsolidationRecord({
      trigger,
      inputCount: plan.stats.input,
      survivorCount: plan.stats.survivors,
      mergedAway: plan.stats.mergedAway,
      invalidated: plan.stats.invalidated,
      contradictionCount: plan.stats.contradictionCount,
      retrievalSamples: retrieval.samples,
      retrievalHitRatePct: retrieval.hitRatePct,
      summary,
    });
  }

  console.info(`[memoryConsolidation] ${summary}`);
  return {
    summary,
    stats: plan.stats,
    retrieval: { samples: retrieval.samples, hitRatePct: retrieval.hitRatePct, avgInjections: retrieval.avgInjections },
    applied: !options.dryRun,
  };
}

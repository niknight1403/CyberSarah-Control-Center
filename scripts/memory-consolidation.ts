/**
 * Sprint 113 — CLI-Einstieg fuer die naechtliche Memory-Konsolidierung.
 * Wird vom Workflow .github/workflows/memory-consolidation.yml mit
 * DATABASE_URL aus den Repo-Secrets aufgerufen (analog seed-admin).
 * Keine externen Keys, kein LLM — nur die Regeln aus
 * lib/agent-memory-consolidation-logic.ts gegen die produktive DB.
 */
import "dotenv/config";

import { runMemoryConsolidation } from "../server/memory-consolidation";

async function main() {
  const result = await runMemoryConsolidation("cron");
  console.log(`[memory-consolidation] ${result.summary}`);
  console.log(
    `[memory-consolidation] Retrieval-Metriken: ${result.retrieval.samples} Stichproben, ` +
      `Trefferquote ${result.retrieval.hitRatePct} %, Ø ${result.retrieval.avgInjections} Injektionen je Turn.`,
  );
}

main().catch((error) => {
  console.error(`[memory-consolidation] Konsolidierung fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

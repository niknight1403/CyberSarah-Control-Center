/**
 * CyberSarah Control Center — Autonome Entwicklung: tRPC-Router (Sprint 164)
 *
 * Admin-Schnittstelle des autonomen Entwicklungs-Agenten:
 * - catalog : alle verfuegbaren App-/Spiel-Templates
 * - stack   : der aktive Zero-Cost-Stack (freie LLMs, Werkzeuge,
 *             Anbindungs-Alternativen) inkl. 0-EUR-Nachweis
 * - develop : autonome Entwicklung starten (Plan -> Personalisierung ->
 *             Verifikation -> Lieferung), synchron mit vollem Ergebnis
 * - developCustom (Sprint 166): EIGENES Spiel aus einer Idee — freier
 *             LLM-Codegenerator (Stufe 2) mit Sandbox-Haerte und
 *             autonome Fix-Schleife, offline ueber Template-Fallback
 * - runs    : letzte Entwicklungslaeufe (Run-Ledger)
 * - preview : HTML eines gelieferten Artefakts (Admin-Vorschau)
 * - liveFix : aktueller Live-Fix-Zustand (Provider-Quarantaene)
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  getProjectCatalog,
  getFreeStackSnapshot,
  listRecentRuns,
  readArtifactHtml,
  runAutonomousDevelopment,
} from "./autonomous-dev";
import { getProviderQuarantineSnapshot } from "../lib/live-fix-logic";
import { runCustomGameDevelopment } from "./custom-game";

const projectKindEnum = z.enum([
  "pong", "snake", "breakout", "flappy",
  "todo", "notes", "calculator", "timer", "custom",
]);

export const autonomousDevRouter = router({
  catalog: adminProcedure.query(() => getProjectCatalog()),

  stack: adminProcedure.query(() => {
    const snapshot = getFreeStackSnapshot();
    return {
      ...snapshot,
      quarantine: getProviderQuarantineSnapshot(),
    };
  }),

  develop: adminProcedure
    .input(z.object({ kind: projectKindEnum, wish: z.string().trim().max(500).optional() }))
    .mutation(async ({ input }) => {
      if (input.kind === "custom") {
        // Custom braucht eine eigene Idee — der Wunsch ist Pflichtfeld.
        if (!input.wish) throw new Error("IDEE_FEHLT: Bei kind=custom beschreibe die Spielidee im Wunsch-Feld.");
        return runCustomGameDevelopment({ idea: input.wish });
      }
      return runAutonomousDevelopment(input);
    }),

  developCustom: adminProcedure
    .input(z.object({ idea: z.string().trim().min(3).max(500) }))
    .mutation(async ({ input }) => runCustomGameDevelopment(input)),

  runs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(25) }).optional())
    .query(({ input }) => listRecentRuns(input?.limit ?? 25)),

  preview: adminProcedure
    .input(z.object({ artifactPath: z.string().trim().min(1).max(300) }))
    .query(({ input }) => ({ html: readArtifactHtml(input.artifactPath) })),
});

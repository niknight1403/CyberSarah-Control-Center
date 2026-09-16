import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { runOrchestratorTask, SUPERAGENT_SYSTEM_PROMPT } from "./orchestrator/superagent";
import { getTask, listTasks } from "./orchestrator/state-store";
import { getToolDefinitions } from "./orchestrator/tool-registry";
import { getOptimizerStatus, listOptimizerCycles, runOptimizerCycle } from "./orchestrator/optimizer-loop";

/**
 * Sprint 123 — Leitender-Superagent-Orchestrator (Admin-gated).
 *
 * Router fuer die Orchestrator-Runtime: Aufgaben starten, Task-Ledger
 * einsehen, Tools und System-Prompt inspizieren. Ausschliesslich fuer
 * Administratoren — die Ausfuehrung von Infrastruktur-Tools (Hetzner,
 * Docker, Git) ist ein vertrauenswuerdiger, geschuetzter Kontext.
 */
export const orchestratorRouter = router({
  /** Fuehrt eine Aufgabe vollstaendig autonom aus und gibt den Task-Record zurueck. */
  run: adminProcedure
    .input(
      z.object({
        objective: z.string().min(3).max(4000),
        title: z.string().min(1).max(200).optional(),
        maxRounds: z.number().int().min(1).max(24).optional(),
      }),
    )
    .mutation(async ({ input }) => runOrchestratorTask(input)),

  /** Task-Ledger als Uebersicht (neueste zuerst). */
  tasks: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => listTasks(input?.limit ?? 50)),

  /** Vollstaendigen Task-Record inkl. aller Schritte, Logs und Fehler abrufen. */
  task: adminProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => getTask(input.id)),

  /** Verfuegbare Tools mit JSON-Schemas (Transparenz fuer den Administrator). */
  tools: adminProcedure.query(() => ({
    tools: getToolDefinitions().map((entry) => entry.function),
  })),

  /** Hinterlegter System-Prompt des Superagenten. */
  systemPrompt: adminProcedure.query(() => ({ prompt: SUPERAGENT_SYSTEM_PROMPT })),

  /** Status des autonomen Engineering-Optimizer-Loops (Cadence, Laufzeit). */
  optimizerStatus: adminProcedure.query(async () => ({
    ...getOptimizerStatus(),
    recentCycles: await listOptimizerCycles(3),
  })),

  /** Zuletzt gelaufene Optimierungs-Zyklen inkl. Findings. */
  optimizerCycles: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(30).optional() }).optional())
    .query(({ input }) => listOptimizerCycles(input?.limit ?? 10)),

  /** Loest einen Optimierungs-Zyklus sofort aus (manuell, Admin). */
  optimizerTrigger: adminProcedure.mutation(async () => {
    const record = await runOptimizerCycle("manual");
    return record;
  }),
});

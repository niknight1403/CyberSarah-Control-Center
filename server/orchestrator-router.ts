import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { runOrchestratorTask, SUPERAGENT_SYSTEM_PROMPT } from "./orchestrator/superagent";
import { getTask, listTasks } from "./orchestrator/state-store";
import { getToolDefinitions } from "./orchestrator/tool-registry";

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
});

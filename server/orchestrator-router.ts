import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { processSecretsInUserMessage } from "./secret-vault";
import { buildSecretStoredNotice } from "../lib/secret-vault-logic";
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
    .mutation(async ({ input, ctx }) => {
      // Sprint 167: Secrets im Ziel verarbeiten — Klartext wird AUTONOM im
      // Vault gespeichert, das Objective maskiert (nie im Ledger offen).
      let secretsNotice: string | null = null;
      try {
        const processed = await processSecretsInUserMessage(ctx.user.openId, input.objective);
        if (processed.storedNames.length > 0) {
          input.objective = processed.sanitizedText;
          secretsNotice = buildSecretStoredNotice(processed.storedNames);
        }
      } catch (error) {
        console.warn("[orchestrator] Secret-Verarbeitung uebersprungen:", error);
      }
      const task = await runOrchestratorTask(input);
      if (secretsNotice && typeof task.finalAnswer === "string") {
        task.finalAnswer = `${task.finalAnswer}${secretsNotice}`;
      } else if (secretsNotice) {
        // Kein finalAnswer: Hinweis als eigenen Schritt dokumentieren.
        const now = new Date().toISOString();
        task.steps.push({
          id: `secrets-${Date.now().toString(36)}`,
          name: "secrets-vault",
          status: "success",
          attempts: 1,
          logs: [secretsNotice.replace(/^\s+$/gm, "").trim()],
          startedAt: now,
          finishedAt: now,
        });
      }
      return task;
    }),

  /** Task-Ledger als Uebersicht (neueste zuerst). */
  tasks: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => {
      // White-Screen-Fix (Sprint 133): Index-Einträge enthielten keine steps/
      // correctionIterations, der Tab las aber task.steps.length -> TypeError.
      // Der Endpoint hydratiert jetzt jeden Index-Eintrag zum Vollrecord;
      // unlesbare Einzelrecords fallen still heraus (Ledger bleibt nutzbar).
      const entries = await listTasks(input?.limit ?? 50);
      const tasks = await Promise.all(
        entries.map(async (entry) => {
          try {
            return await getTask(entry.id);
          } catch {
            return null;
          }
        }),
      );
      return tasks.filter((task): task is NonNullable<typeof task> => task != null);
    }),

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

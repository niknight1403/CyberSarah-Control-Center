/**
 * Sprint 154 — Provider-Admin-Router: Admin-Sicht auf Provider-Keys.
 *
 * Alle Prozeduren sind strikt admin-gated (adminProcedure). Rueckgaben
 * enthalten ausschliesslich maskierte Fingerprints, Diagnosen und
 * sichere Meldungen — niemals Voll-Keys, Authorization-Header oder
 * rohe Provider-Antworten.
 */
import { z } from "zod";

import { adminProcedure, router } from "./_core/trpc";
import {
  autonomousKeyRecovery,
  getProviderMatrix,
  listAuditEvents,
  rotateProviderKey,
  runHealthCheck,
  runHealthCheckAll,
  setProviderDisabled,
  stageStandbyKey,
} from "./provider-admin";
import { providerAdminMeta, type ProviderAdminId } from "../lib/provider-admin-logic";

export const providerAdminIdSchema = z.enum([
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "together",
  "huggingface",
  "ollama",
  "lmstudio",
  "custom",
]);

export const providerAdminRouter = router({
  /** Provider-Matrix: Status, maskierte Keys, Ablauf, Fallback-Rang. */
  list: adminProcedure.query(() => getProviderMatrix()),

  /** Einzelnen Provider per offiziellem, kostenlosem Endpunkt pruefen. */
  healthCheck: adminProcedure
    .input(z.object({ provider: providerAdminIdSchema }))
    .mutation(({ input }) => runHealthCheck(input.provider as ProviderAdminId)),

  /** Alle Provider sequentiell pruefen (gedrosselt, keine aggressive Schleife). */
  healthCheckAll: adminProcedure.mutation(() => runHealthCheckAll()),

  /** Provider deaktivieren (aus dem Routing nehmen) / reaktivieren. */
  setDisabled: adminProcedure
    .input(z.object({ provider: providerAdminIdSchema, disabled: z.boolean() }))
    .mutation(({ input }) => setProviderDisabled(input.provider as ProviderAdminId, input.disabled)),

  /**
   * Neuen Key verschluesselt als Standby hinterlegen (nicht aktiv).
   * Der Key wird nur serverseitig verschluesselt gespeichert und nie
   * zurueckgegeben — nur der maskierte Fingerprint.
   */
  stageKey: adminProcedure
    .input(
      z.object({
        provider: providerAdminIdSchema,
        apiKey: z.string().min(8).max(512),
        expiresAt: z.string().trim().max(40).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const meta = providerAdminMeta(input.provider as ProviderAdminId);
      return stageStandbyKey({
        provider: input.provider as ProviderAdminId,
        apiKey: input.apiKey,
        expiresAt: input.expiresAt ?? null,
      }).then((result) => ({
        provider: meta.label,
        ...result,
      }));
    }),

  /**
   * Autonome Key-Recovery manuell anstossen (ENV-Pool -> Secret-Manager).
   * Im Chat-Betrieb feuert sie automatisch bei 401/403/429/Key-Fehlern.
   */
  autonomousRotate: adminProcedure
    .input(z.object({ provider: providerAdminIdSchema }))
    .mutation(({ input }) => autonomousKeyRecovery(input.provider as ProviderAdminId)),

  /** Rotation: Standby-Key pruefen, nur bei Erfolg aktivieren. */
  rotate: adminProcedure
    .input(z.object({ provider: providerAdminIdSchema }))
    .mutation(({ input }) => rotateProviderKey(input.provider as ProviderAdminId)),

  /** Secret-freie Audit-Events (Key hinzugefügt, Rotation, Disable/Enable). */
  events: adminProcedure.query(() => listAuditEvents()),
});

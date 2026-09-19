/**
 * CyberSarah Control Center — Secrets-Router (Sprint 167)
 *
 * Nutzer-gescoped (kein Admin noetig, analog Projekte-/Superagenten-Router):
 *
 *   - list   : eigene Secrets — NUR Metadaten + maskierte Vorschau,
 *              NIE der Klartext-Wert.
 *   - upsert : Secret anlegen/aktualisieren (Wert wird serverseitig
 *              AES-256-GCM-verschluesselt; Antwort enthaelt nur Metadaten).
 *   - delete : Secret entfernen.
 *
 * Die Chat-Pipelines (Superagent + Repo-/Entwicklungs-Chat) speichern
 * erkannte Keys AUTONOM via processSecretsInUserMessage() — dieser Router
 * ist die bewusste Verwaltungsoberflaeche dafuer.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { deleteSecret, listSecrets, upsertSecret } from "./secret-vault";

const secretKindEnum = z.enum([
  "openai",
  "groq",
  "anthropic",
  "google",
  "github",
  "openrouter",
  "slack",
  "aws",
  "bearer",
  "hex_token",
  "custom",
]);

export const secretsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => listSecrets(ctx.user.openId)),

  upsert: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(3).max(40),
        value: z.string().trim().min(8).max(4096),
        kind: secretKindEnum.optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => upsertSecret(ctx.user.openId, input)),

  delete: protectedProcedure
    .input(z.object({ name: z.string().trim().min(3).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await deleteSecret(ctx.user.openId, input.name);
      if (!removed) throw new Error(`NICHT_GEFUNDEN: Kein Secret '${input.name}' im Vault.`);
      return { removed: true, name: input.name.trim().toUpperCase() };
    }),
});

/**
 * Block 2 (Multi-Tenancy) — tRPC-Router fuer API-Schluessel.
 *
 * Jedes Konto verwaltet ausschliesslich seine eigenen Schluessel: der Mandant
 * kommt aus ctx.user (tenantOf), nie aus der Eingabe. Admins sehen hier bewusst
 * KEINE fremden Schluessel — die Liste enthaelt nur maskierte Praefixe, aber
 * fremde Zugangsdaten gehen auch einen Admin im Dashboard nichts an.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { tenantOf } from "./_core/tenant";
import { ApiKeyError, MAX_ACTIVE_KEYS_PER_TENANT } from "../lib/api-key-logic";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-key-service";

function uebersetzeFehler(error: unknown): never {
  if (error instanceof ApiKeyError) {
    throw new TRPCError({
      code: error.code === "limit-reached" ? "PRECONDITION_FAILED" : "BAD_REQUEST",
      message: error.message,
    });
  }
  throw error;
}

export const apiKeysRouter = router({
  /** Eigene Schluessel (maskiert, ohne Klartext und ohne Hash). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenant = tenantOf(ctx.user);
    const keys = await listApiKeys(tenant.openId);
    return { keys, maxActive: MAX_ACTIVE_KEYS_PER_TENANT };
  }),

  /** Neuen Schluessel anlegen — Klartext erscheint genau einmal in der Antwort. */
  create: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(120),
        scope: z.enum(["read", "write"]).optional(),
        expiresInDays: z.number().int().positive().max(3650).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = tenantOf(ctx.user);
      try {
        return await createApiKey({
          ownerOpenId: tenant.openId,
          label: input.label,
          scope: input.scope ?? "write",
          expiresInDays: input.expiresInDays,
        });
      } catch (error) {
        uebersetzeFehler(error);
      }
    }),

  /** Widerrufen (idempotent: zweiter Aufruf meldet alreadyRevoked). */
  revoke: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenant = tenantOf(ctx.user);
      try {
        return await revokeApiKey(tenant.openId, input.id);
      } catch (error) {
        uebersetzeFehler(error);
      }
    }),
});

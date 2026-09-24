import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import {
  activePacksForUser,
  createAssetPack,
  deleteAssetPack,
  listAssetPacksForUser,
  setAssetPackActive,
} from "./asset-packs";
import { mediaPipelineStatus } from "./media-pipeline";

/**
 * Sprint 280 — tRPC-Router für Asset-Packs (Outfit-/Sets-Packs).
 * Alle Operationen sind nutzer-scoped: ctx.user.openId, niemals global.
 */
export const assetPacksRouter = router({
  /** Alle Packs des Nutzers + die aktuell für den nächsten Render wirksamen. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const packs = await listAssetPacksForUser(ctx.user.openId);
    const active = await activePacksForUser(ctx.user.openId);
    return { packs, active, limits: { maxPacks: 12, maxModifiers: 5 } };
  }),

  create: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["outfit", "sets"]),
        name: z.string().min(3).max(48),
        promptModifiers: z.array(z.string().min(3).max(80)).min(1).max(5),
        fallbackColors: z.tuple([z.string().regex(/^[0-9a-fA-F]{6}$/), z.string().regex(/^[0-9a-fA-F]{6}$/)]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createAssetPack(ctx.user.openId, input);
      if (!result.ok) return { ok: false as const, error: result.error, retryHint: result.retryHint };
      return { ok: true as const, packs: result.packs };
    }),

  activate: protectedProcedure
    .input(z.object({ packId: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const result = await setAssetPackActive(ctx.user.openId, input.packId, input.active);
      if (!result.ok) return { ok: false as const, error: result.error, retryHint: result.retryHint };
      return { ok: true as const, packs: result.packs };
    }),

  remove: protectedProcedure
    .input(z.object({ packId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await deleteAssetPack(ctx.user.openId, input.packId);
      if (!result.ok) return { ok: false as const, error: result.error, retryHint: result.retryHint };
      return { ok: true as const, packs: result.packs };
    }),

  /** Ehrlicher Pipeline-Status inkl. wirksamer Packs — für den Medien-Studio-Screen. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const pipeline = await mediaPipelineStatus();
    const active = await activePacksForUser(ctx.user.openId);
    return { pipeline, activePacks: active };
  }),
});

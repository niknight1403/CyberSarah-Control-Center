/**
 * Sprint 346 — Freigabe-Queue-Router: Lesen der autonomen Entwuerfe und
 * die menschliche Entscheidung (approve/reject). runNow ist admin-only
 * und startet einen Engine-Lauf sofort statt auf den Cron zu warten.
 */
import { z } from "zod";

import { decideDraft, listDraftQueue, runDraftEngine } from "./draft-engine";
import { buildDraftQueueView, type DraftRow } from "../lib/draft-engine-logic";
import { protectedProcedure, router } from "./_core/trpc";

function serializeRow(row: Awaited<ReturnType<typeof listDraftQueue>>[number]): DraftRow {
  return {
    id: row.id,
    kind: row.kind as DraftRow["kind"],
    title: row.title,
    payload: row.payload as DraftRow["payload"],
    status: row.status as DraftRow["status"],
    createdAtMs: row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime(),
    decidedAtMs: row.decidedAt instanceof Date ? row.decidedAt.getTime() : row.decidedAt ? new Date(row.decidedAt).getTime() : null,
  };
}

export const draftEngineRouter = router({
  /** Freigabe-Queue: pending nach Art gruppiert + bereits entschieden. */
  queue: protectedProcedure.query(async () => {
    const rows = (await listDraftQueue(60)).map(serializeRow);
    const view = buildDraftQueueView(rows, Date.now());
    // Label-Funktionen bleiben Client-seitig (lib/draft-engine-logic) —
    // ueber tRPC wandern nur serialisierbare Daten.
    return view;
  }),

  /** Entscheidung ueber einen pending-Entwurf — nur Menschen. */
  decide: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), action: z.enum(["approve", "reject"]) }))
    .mutation(async ({ input, ctx }) => {
      const decidedBy = ctx.user?.openId ?? ctx.user?.email ?? "unbekannt";
      const row = await decideDraft(input.id, input.action, String(decidedBy));
      if (!row) return { ok: false as const, reason: "Entwurf nicht (mehr) offen — vielleicht schon entschieden." };
      return { ok: true as const, row: serializeRow(row) };
    }),

  /** Admin-Trigger: Engine sofort ausfuehren (sonst taeglicher Cron). */
  runNow: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new Error("Nur Administratoren duerfen die Engine manuell starten.");
    }
    const result = await runDraftEngine();
    return { ok: true as const, result };
  }),
});

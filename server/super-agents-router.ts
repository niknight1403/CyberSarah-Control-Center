/**
 * Sprint 137 — Superagenten-Router: mehrere benannte Superagenten pro
 * Nutzer, jeder mit eigener Aufgabe/Ziel und eigenem, isoliertem
 * Chatverlauf (verknuepft ueber sessionId). Nutzer-gescoped (kein Admin
 * noetig) ueber ctx.user.openId, analog zum Projekte-Router.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  deleteSuperAgentRecord,
  insertSuperAgentRecord,
  insertSuperAgentRecords,
  listSuperAgentsForUser,
  touchSuperAgentLastActive,
  updateSuperAgentRecord,
} from "./db";
import {
  defaultSeedSuperAgent,
  generateSuperAgentSessionId,
  nextSuperAgentColor,
  normalizeSuperAgentInput,
  normalizeSuperAgentPatch,
  sortSuperAgentsByActivity,
  SUPER_AGENT_STATUSES,
} from "../lib/super-agents-logic";

const superAgentInputSchema = z.object({
  name: z.string().min(1).max(80),
  purpose: z.string().max(400).optional(),
  color: z.string().max(16).optional(),
});

function serialize<T extends { lastActiveAt: Date; createdAt: Date }>(row: T) {
  return { ...row, lastActiveAt: row.lastActiveAt.toISOString(), createdAt: row.createdAt.toISOString() };
}

export const superAgentsRouter = router({
  /** Superagenten des Nutzers — seedet einmalig den Standard-Agenten ("Elara"), wenn leer. */
  list: protectedProcedure.query(async ({ ctx }) => {
    let rows = await listSuperAgentsForUser(ctx.user.openId);
    if (rows.length === 0) {
      const seed = defaultSeedSuperAgent();
      await insertSuperAgentRecords([{ ...seed, userOpenId: ctx.user.openId }]);
      rows = await listSuperAgentsForUser(ctx.user.openId);
    }
    return sortSuperAgentsByActivity(rows.map(serialize));
  }),

  create: protectedProcedure.input(superAgentInputSchema).mutation(async ({ ctx, input }) => {
    const existing = await listSuperAgentsForUser(ctx.user.openId);
    const normalized = normalizeSuperAgentInput(input, nextSuperAgentColor(existing.length));
    const sessionId = generateSuperAgentSessionId(randomUUID());
    const saved = await insertSuperAgentRecord({
      ...normalized,
      sessionId,
      userOpenId: ctx.user.openId,
      isDefault: false,
    });
    return serialize(saved);
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(80).optional(),
        purpose: z.string().max(400).optional(),
        color: z.string().max(16).optional(),
        status: z.enum(SUPER_AGENT_STATUSES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const patch = normalizeSuperAgentPatch(changes);
      const saved = await updateSuperAgentRecord(id, ctx.user.openId, patch);
      if (!saved) throw new Error("Superagent nicht gefunden.");
      return serialize(saved);
    }),

  /** Merkt einen Agenten als zuletzt verwendet vor — Basis fuer "Zuletzt verwendete Agenten". */
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const saved = await touchSuperAgentLastActive(input.id, ctx.user.openId);
    if (!saved) throw new Error("Superagent nicht gefunden.");
    return serialize(saved);
  }),

  /** Loescht einen Superagenten dauerhaft. Der Standard-Agent kann nicht geloescht werden. */
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const rows = await listSuperAgentsForUser(ctx.user.openId);
    const target = rows.find((row) => row.id === input.id);
    if (target?.isDefault) throw new Error("Der Standard-Agent kann nicht gelöscht werden — archiviere ihn stattdessen.");
    await deleteSuperAgentRecord(input.id, ctx.user.openId);
    return { success: true } as const;
  }),
});

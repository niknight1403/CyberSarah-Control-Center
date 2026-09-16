/**
 * Sprint 132 — Projekte-Router: dauerhaftes Gedächtnis der laufenden
 * Projekte eines Nutzers. Nutzer-gescoped (kein Admin nötig) über
 * ctx.user.openId, analog zu den Chat-/Learning-Routern. Beim ersten
 * Aufruf ohne vorhandene Projekte wird automatisch mit den bekannten
 * Vorhaben (CyberSarah Control Center, Revenue OS) vorbefüllt.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { deleteProjectRecord, insertProjectRecord, insertProjectRecords, listProjectsForUser, updateProjectRecord } from "./db";
import { defaultSeedProjects, normalizeProjectInput, normalizeProjectPatch, PROJECT_STATUSES, sortProjectsByActivity } from "../lib/projects-logic";

const projectInputSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  repositoryUrl: z.string().max(300).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const projectsRouter = router({
  /** Projekte des Nutzers — seedet einmalig die bekannten Vorhaben, wenn leer. */
  list: protectedProcedure.query(async ({ ctx }) => {
    let rows = await listProjectsForUser(ctx.user.openId);
    if (rows.length === 0) {
      const seeds = defaultSeedProjects().map((seed) => ({ ...seed, userOpenId: ctx.user.openId }));
      await insertProjectRecords(seeds);
      rows = await listProjectsForUser(ctx.user.openId);
    }
    return sortProjectsByActivity(rows.map((row) => ({ ...row, lastActivityAt: row.lastActivityAt.toISOString(), createdAt: row.createdAt.toISOString() })));
  }),

  create: protectedProcedure.input(projectInputSchema).mutation(async ({ ctx, input }) => {
    const normalized = normalizeProjectInput(input);
    const saved = await insertProjectRecord({ ...normalized, userOpenId: ctx.user.openId });
    return { ...saved, lastActivityAt: saved.lastActivityAt.toISOString(), createdAt: saved.createdAt.toISOString() };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }).merge(projectInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const patch = normalizeProjectPatch(changes);
      const saved = await updateProjectRecord(id, ctx.user.openId, patch);
      if (!saved) throw new Error("Projekt nicht gefunden.");
      return { ...saved, lastActivityAt: saved.lastActivityAt.toISOString(), createdAt: saved.createdAt.toISOString() };
    }),

  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await deleteProjectRecord(input.id, ctx.user.openId);
    return { success: true } as const;
  }),
});

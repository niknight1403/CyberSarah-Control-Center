/**
 * Sprint 3 — AI Influenza Router (admin-only).
 * Dieses Tor ist bewusst auf adminProcedure beschraenkt: Agenten erzeugen
 * geschaeftsrelevante Inhalte, Ausfuehrung kostet LLM-Zeit und Freigaben
 * duerfen nur von einem Menschen kommen.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import {
  arbeiteQueueAb,
  ensureAgenten,
  fuehreAufgabeAus,
  gibAufgabeFrei,
  ladeUebersicht,
  legeAufgabeAn,
  listeAufgabeTypen,
} from "./ai-influenza-engine";

const aufgabeTypSchema = z.string().min(2).max(64);

export const aiInfluenzaRouter = router({
  /** Legt die acht Agenten an bzw. aktualisiert sie; liefert die Uebersicht. */
  initialisieren: adminProcedure.mutation(async () => {
    const result = await ensureAgenten();
    return result;
  }),

  uebersicht: adminProcedure.query(async () => {
    return ladeUebersicht();
  }),

  aufgabeTypen: adminProcedure.query(() => {
    return { typen: listeAufgabeTypen() };
  }),

  aufgabeAnlegen: adminProcedure
    .input(
      z.object({
        aufgabeTyp: aufgabeTypSchema,
        titel: z.string().max(255).optional(),
        eingabe: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await legeAufgabeAn({
        aufgabeTyp: input.aufgabeTyp,
        titel: input.titel,
        eingabe: input.eingabe,
        erstelltVon: ctx.user?.email ?? "admin",
      });
      return { angelegt: result.angelegt, aufgabeId: result.aufgabe.id, status: result.aufgabe.status };
    }),

  aufgabeAusfuehren: adminProcedure
    .input(z.object({ aufgabeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await fuehreAufgabeAus(input.aufgabeId);
      if (!result.ausgefuehrt) {
        throw new TRPCError({ code: "CONFLICT", message: `Aufgabe nicht ausführbar: ${result.grund ?? "unbekannt"}` });
      }
      return {
        status: result.status,
        ergebnis: result.ergebnis ?? null,
        fehler: result.grund ?? null,
      };
    }),

  queueAbarbeiten: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(10).optional() }).optional())
    .mutation(async ({ input }) => {
      return arbeiteQueueAb(input?.limit ?? 1);
    }),

  freigeben: adminProcedure
    .input(z.object({ aufgabeId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const freigeber = ctx.user?.email ?? "";
      if (!freigeber) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Freigabe benötigt einen angemeldeten Nutzer" });
      }
      const result = await gibAufgabeFrei(input.aufgabeId, freigeber);
      if (!result.freigegeben) {
        throw new TRPCError({ code: "CONFLICT", message: `Freigabe nicht möglich: ${result.grund ?? "unbekannt"}` });
      }
      return { ok: true, freigegebenVon: freigeber };
    }),
});

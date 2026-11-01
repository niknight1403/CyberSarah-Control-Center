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
import {
  AiInfluenzaStripeError,
  erstelleCheckout,
  richteStripeObjekteEin,
  stripeStatus,
  umsatzUebersicht,
} from "./ai-influenza-stripe";
import { revenueRows } from "./revenue-command-service";

function alsTrpcFehler(err: unknown): never {
  if (err instanceof AiInfluenzaStripeError) {
    throw new TRPCError({ code: err.status === 403 ? "FORBIDDEN" : err.status === 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: err.message });
  }
  throw err;
}

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

  /** Status der Stripe-Anbindung (Modus, Freigabe), ohne Netzwerkaufruf und ohne Secrets. */
  stripeStatus: adminProcedure.query(() => stripeStatus()),

  /**
   * Stripe-Produkte/Preise einrichten. Standard ist ein Trockenlauf; echtes Anlegen
   * erfordert trocken=false, und im Live-Modus zusaetzlich AI_INFLUENZA_STRIPE_LIVE=true.
   */
  stripeEinrichten: adminProcedure
    .input(z.object({ trocken: z.boolean().default(true) }).optional())
    .mutation(async ({ input }) => {
      try {
        return await richteStripeObjekteEin({ trocken: input?.trocken ?? true });
      } catch (err) {
        return alsTrpcFehler(err);
      }
    }),

  /** Checkout-Link zu einem freigegebenen Angebot. Angebot/Kunde werden serverseitig geprueft. */
  checkoutErstellen: adminProcedure
    .input(z.object({ angebotId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const rows = await revenueRows<{ id: number; paket: string; status: string; kunde_id: number | null; email: string | null }>(
        `SELECT a.id, a.paket, a.status, a.kunde_id, k.email FROM angebote a LEFT JOIN kunden k ON k.id = a.kunde_id WHERE a.id = ${Number(input.angebotId)} LIMIT 1`,
      );
      const angebot = rows[0];
      if (!angebot) throw new TRPCError({ code: "NOT_FOUND", message: "Angebot nicht gefunden." });
      if (!angebot.kunde_id || !angebot.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dem Angebot ist kein Kunde mit E-Mail zugeordnet." });
      }
      try {
        return await erstelleCheckout({
          paketId: angebot.paket,
          kundeId: angebot.kunde_id,
          angebotId: angebot.id,
          kundeEmail: angebot.email,
          angebotStatus: angebot.status,
        });
      } catch (err) {
        return alsTrpcFehler(err);
      }
    }),

  /** Umsatz (nur bestaetigte Zahlungen) und Kosten, getrennt erfasst. */
  umsatz: adminProcedure.query(() => umsatzUebersicht()),

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

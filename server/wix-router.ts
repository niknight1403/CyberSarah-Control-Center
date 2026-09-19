/**
 * Sprint 187 — Wix-Router: Admin-Sicht auf die Wix-API-Anbindung.
 *
 * Alle Prozeduren sind strikt admin-gated (adminProcedure). Rueckgaben
 * enthalten ausschliesslich maskierte Token-Infos, normalisierte Daten und
 * klassifizierte, sichere Fehler — niemals den Klartext-Key.
 */

import { z } from "zod";

import { adminProcedure, router } from "./_core/trpc";
import {
  fetchWixOrders,
  fetchWixSiteProperties,
  fetchWixSites,
  getWixStatus,
  setWixSiteId,
  setWixToken,
  WixApiError,
} from "./wix";

/** Fuehrt eine Wix-Abfrage aus und uebersetzt WixApiError in TRPC-Fehler. */
async function runWix<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof WixApiError) {
      throw new Error(
        `${error.failure.kind.toUpperCase()}: ${error.failure.message} → ${error.failure.hint ?? ""}`,
      );
    }
    throw error;
  }
}

export const wixRouter = router({
  /** Ehrlicher Konfigurations-Status (Token, Konto, Site-ID, naechster Schritt). */
  status: adminProcedure.query(() => getWixStatus()),

  /** Wix-API-Key zur Laufzeit setzen (AES-verschluesselt im KV, kein Klartext). */
  setToken: adminProcedure
    .input(z.object({ apiKey: z.string().trim().min(20).max(8192) }))
    .mutation(({ input }) => setWixToken(input.apiKey)),

  /** Site-ID zur Laufzeit setzen (KV — ohne Redeploy). */
  setSiteId: adminProcedure
    .input(z.object({ siteId: z.string().trim().min(30).max(60) }))
    .mutation(({ input }) => setWixSiteId(input.siteId)),

  /** Alle Sites des API-Key-Kontos (Site List Read) — Abruf per Knopfdruck. */
  sites: adminProcedure.mutation(() => runWix(() => fetchWixSites())),

  /** Site-Properties der konfigurierten Site — Abruf per Knopfdruck. */
  siteProperties: adminProcedure.mutation(() => runWix(() => fetchWixSiteProperties())),

  /** eCommerce-Orders der konfigurierten Site (read-only) — Abruf per Knopfdruck. */
  orders: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .mutation(({ input }) => runWix(() => fetchWixOrders({ limit: input?.limit }))),
});

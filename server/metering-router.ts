/**
 * Sprint 115 — Provider-Metering-Router: Admin-Sicht auf den Key-Pool.
 * Standardnutzer sehen keine Key-Details: metering.overview ist ueber
 * adminProcedure strikt admin-gated; die Overview enthaelt nur Quellen-
 * IDs und maskierte Labels ("…ab12"), niemals Voll-Keys.
 */
import { getManagedPoolSnapshotForMetering } from "./_core/llm";
import {
  evaluateAndNotifyQuotaWarnings,
  getProviderMeteringOverview,
} from "./provider-metering";
import { sendOpsDiscordAlert } from "./ops-alerts";
import { adminProcedure, router } from "./_core/trpc";

export const meteringRouter = router({
  /** Kombinierte Admin-Overview: Pool-Zustaende + 24-h-Metering-Ledger. */
  overview: adminProcedure.query(() =>
    getProviderMeteringOverview(getManagedPoolSnapshotForMetering()),
  ),

  /**
   * Prueft die Quota-Warnschwelle (Standard 80 %) und benachrichtigt bei
   * neuem Ueberschreiten genau einmal je Schwelle und Key — manueller
   * Ausloeser fuer den Admin; automatisch feuert der Warncall nach jedem
   * verwalteten LLM-Aufruf (server/_core/llm.ts ruft evaluateAndNotify
   * ausserhalb des Hot Paths).
   */
  checkQuotaWarnings: adminProcedure.mutation(async () => {
    const pool = getManagedPoolSnapshotForMetering();
    const result = await evaluateAndNotifyQuotaWarnings(pool, sendOpsDiscordAlert);
    return result;
  }),
});

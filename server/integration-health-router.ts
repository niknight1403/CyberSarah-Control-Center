/**
 * tRPC-Router `integrationHealth` — Live-Zustand der Betriebs-Integrationen.
 *
 * Abgrenzung zu `integrationsRouter` (Sprint 263): der beantwortet "ist der
 * Schluessel gesetzt?" aus der Registry, ohne Netzaufruf, oeffentlich. Dieser
 * Router beantwortet "funktioniert die Integration gerade?" und ruft dafuer
 * Resend, TikTok und Meta lesend an.
 *
 * Deshalb bewusst nicht oeffentlich:
 *   status   protectedProcedure — jeder angemeldete Nutzer darf den Zustand
 *            sehen (Dashboard), aber nicht anonym Provider-Quota ausloesen.
 *   refresh  adminProcedure — erzwingt einen frischen Lauf am 5-Minuten-Cache
 *            vorbei; das ist ein Betriebseingriff, kein Normalbetrieb.
 *
 * Keine Secrets in der Antwort: nur Pruefnamen, Severity und Klartext-Details.
 * ENV-Werte werden nie zurueckgegeben.
 */
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getLiveProbes, resetLiveProbeCache, type LiveProbeReport } from "./integrations/live-probe-service";
import { computeProbeOverall, type LiveProbeProvider } from "../lib/integration-live-probe-logic";

const providerSchema = z.enum(["resend", "tiktok", "meta"]);

function shapeReport(report: LiveProbeReport, provider?: LiveProbeProvider) {
  const results = provider ? report.results.filter((result) => result.provider === provider) : report.results;
  const failed = results.filter((result) => result.severity === "fail").length;
  const warned = results.filter((result) => result.severity === "warn").length;
  const skipped = results.filter((result) => result.severity === "skip").length;
  const passed = results.filter((result) => result.severity === "pass").length;

  return {
    checkedAt: report.checkedAt,
    durationMs: report.durationMs,
    domain: report.domain,
    fromCache: report.fromCache,
    overall: computeProbeOverall(results),
    counts: { passed, warned, skipped, failed, total: results.length },
    results: results.map((result) => ({
      provider: result.provider,
      name: result.name,
      severity: result.severity,
      detail: result.detail,
    })),
  };
}

export const integrationHealthRouter = router({
  /**
   * Aktueller Live-Zustand. Nutzt den 5-Minuten-Cache, damit ein
   * Dashboard-Reload keine zusaetzlichen Provider-Aufrufe erzeugt.
   */
  status: protectedProcedure
    .input(
      z
        .object({
          provider: providerSchema.optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const report = await getLiveProbes({ force: input?.force ?? false });
      return shapeReport(report, input?.provider);
    }),

  /** Erzwingt einen frischen Live-Lauf (Cache wird verworfen). */
  refresh: adminProcedure.mutation(async () => {
    resetLiveProbeCache();
    const report = await getLiveProbes({ force: true });
    return shapeReport(report);
  }),

  /**
   * Nur die Handlungsbedarfe (fail + warn) — fuer Banner im UI, ohne dass
   * der Client die Severity-Logik nachbauen muss.
   */
  issues: protectedProcedure.query(async () => {
    const report = await getLiveProbes();
    const issues = report.results.filter((result) => result.severity === "fail" || result.severity === "warn");
    return {
      checkedAt: report.checkedAt,
      overall:
        issues.length === 0
          ? ("pass" as const)
          : issues.some((result) => result.severity === "fail")
            ? ("fail" as const)
            : ("warn" as const),
      count: issues.length,
      issues: issues.map((result) => ({
        provider: result.provider,
        name: result.name,
        severity: result.severity,
        detail: result.detail,
      })),
    };
  }),
});

import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import {
  acknowledgeIncident,
  analyzeIncident,
  applyRedeployRemedy,
  decryptAtRest,
  getIncident,
  listIncidents,
  recordCrashReport,
  scanRuntimeLogsNow,
} from "./self-healing";
import { SIGNATURE_RULES } from "../lib/self-healing-logic";

/**
 * Sprint 125 — Self-Healing-Router.
 *
 *   - crashReporting.report (public, rate-light): mobiler Crash-Report, wird
 *     serverseitigverschluesselt (AES-256-GCM) persistiert. Bewusst ohne Login-
 *     Zwang: Crashes passieren auch vor der Anmeldung — Payloads sind auf
 *     Struktur/ Groesse beschraenkt und tragen bewusst keine PII-Felder.
 *   - selfHealing.* (admin): Incident-Ledger, Live-Scan, Orchestrator-Analyse,
 *     Redeploy-Remedy und entschluesselte Crash-Payloads.
 */
export const selfHealingRouter = router({
  /** Incident-Uebersicht (neueste zuerst). */
  incidents: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => listIncidents(input?.limit ?? 50)),

  /** Einzelnes Incident inkl. Analyse-Ergebnis. */
  incident: adminProcedure
    .input(z.object({ id: z.string().min(1).max(120) }))
    .query(async ({ input }) => {
      const incident = await getIncident(input.id);
      if (!incident?.encryptedPayload) return incident;
      return { ...incident, decryptedPayload: decryptAtRest(incident.encryptedPayload) };
    }),

  /** Manueller Live-Scan des Runtime-Log-Puffers (auch vom Python-Monitor nutzbar). */
  scanNow: adminProcedure.mutation(async () => scanRuntimeLogsNow()),

  /** Orchestrator-Analyse anstossen (Superagent analysiert + Fix-Vorschlag). */
  analyze: adminProcedure
    .input(z.object({ id: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => analyzeIncident(input.id)),

  /** Redeploy-Remedy anwenden (kanonischer GitHub-Workflow-Dispatch). */
  applyRemedy: adminProcedure
    .input(z.object({ id: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => applyRedeployRemedy(input.id)),

  /** Incident als bearbeitet markieren. */
  acknowledge: adminProcedure
    .input(z.object({ id: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => acknowledgeIncident(input.id)),

  /** Bekannte Signatur-Regeln mit Remedies (Transparenz fuer den Admin). */
  signatures: adminProcedure.query(() => ({
    rules: SIGNATURE_RULES.map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      finding: rule.finding,
      remedy: rule.remedy,
    })),
    autoRedeployEnabled: process.env.SELF_HEALING_AUTO_REDEPLOY === "true",
  })),
});

/**
 * Crash-Reporting (mobil) — public: Crashes muessen auch ohne Login
 * meldbar sein. Felder strikt beschraenkt (keine PII-Felder, Groessen-
 * limits via zod), serverseitige Verschluesselung at-rest.
 */
export const crashReportingRouter = router({
  report: publicProcedure
    .input(
      z.object({
        appVersion: z.string().min(1).max(40),
        platform: z.string().min(1).max(60),
        message: z.string().min(1).max(2000),
        stack: z.string().max(6000).optional(),
        componentStack: z.string().max(6000).optional(),
        breadcrumbs: z.array(z.string().max(200)).max(20).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const incident = await recordCrashReport(input);
      // Nach aussen nur die Incident-Id — niemals Payload oder Zaehler.
      return { received: true, incidentId: incident.id, severity: incident.severity };
    }),
});

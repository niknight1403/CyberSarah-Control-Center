/**
 * Sprint 351 — Saeulen-Router: Fuehrt die drei Geschaefstsaeulen
 * (Micro-SaaS-Fabrik, Content-Engine, Outreach-Agent) mit dem API-Rotator
 * und der Ollama-Fleet zusammen. Lese-/Plan-Endpunkte sind eingeloggt
 * nutzbar, System-Steuerung (Rotator) bleibt Admin-only.
 */
import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import { getRouteRotationStatus, startRouteRotationAgent } from "./route-rotation-agent";
import {
  aggregatePillarStatus,
  DEPARTMENTS,
  getPillar,
  listDepartmentsForPillar,
  PILLARS,
  routePillarTask,
  selfTestPillarRegistry,
  type PillarId,
} from "../core/router/pillar-router-logic";
import { planSaaSToolBuild, scoreSaaSToolIdea } from "../modules/saas-factory/saas-factory-logic";
import { planContentBatch, seoMetaCheck } from "../modules/content-engine/content-engine-logic";
import { buildOutreachSequence, rankLeads, type Lead } from "../modules/outreach-agent/outreach-agent-logic";

/** Nennt die saeulenbezogene Rotator-Entscheidung fuer die UI (ehrlich, ohne API-Keys). */
function pillarRouteSnapshots() {
  // Rotator-Status liefern die Health-Entscheidungen; die Modell-Leiter
  // wird serverseitig nicht erkundet (kein Blocking-Call im Hot-Pfad).
  return PILLARS.map((pillar) => ({
    id: pillar.id,
    title: pillar.title,
    mission: pillar.mission,
    module: pillar.module,
    departments: listDepartmentsForPillar(pillar.id).map((department) => ({
      id: department.id,
      title: department.title,
      kind: department.kind,
      modulePath: department.modulePath,
      integration: department.integration,
    })),
  }));
}

export const pillarsRouter = router({
  /** Registry + Selbstpruefung (Green Rule) — Eingeloggt lesbar. */
  overview: protectedProcedure.query(() => {
    const selfTest = selfTestPillarRegistry();
    return {
      pillars: pillarRouteSnapshots(),
      departments: DEPARTMENTS.map((department) => ({ id: department.id, title: department.title, kind: department.kind, pillar: department.pillar, modulePath: department.modulePath })),
      selfTest,
      status: selfTest.ok ? ("green" as const) : ("red" as const),
    };
  }),

  /** Saeule 1: Micro-SaaS-Build-Plan aus einer Idee (0-Euro-Pfad). */
  saasPlan: protectedProcedure
    .input(z.object({ title: z.string().min(3).max(120), mission: z.string().max(400).default("") }))
    .query(({ input }) => planSaaSToolBuild(input.title, input.mission)),

  /** Saeule 1: Ideen-Score ohne Speicherung. */
  saasScore: protectedProcedure
    .input(z.object({ title: z.string().min(3).max(120), mission: z.string().max(400).default("") }))
    .query(({ input }) => scoreSaaSToolIdea(input.title, input.mission)),

  /** Saeule 2: 7-Tage-SEO-Kalender (Entscheidung via Draft-Queue). */
  contentBatch: protectedProcedure
    .input(z.object({ keywords: z.array(z.string().min(2).max(80)).min(1).max(24), days: z.number().int().min(1).max(28).default(7) }))
    .query(({ input }) => planContentBatch(input.keywords, new Date(), input.days)),

  /** Saeule 2: SEO-Meta-Check. */
  contentSeoCheck: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200), description: z.string().min(0).max(400), keyword: z.string().min(1).max(120) }))
    .query(({ input }) => seoMetaCheck(input.title, input.description, input.keyword)),

  /** Saeule 3: Lead-Ranking + Sequenz — Versand nur nach Regisseur-Freigabe. */
  outreachSequence: protectedProcedure
    .input(
      z.object({
        company: z.string().min(1).max(120),
        industry: z.string().max(80).default("unklar"),
        employees: z.number().int().min(0).max(1_000_000).default(10),
        channel: z.enum(["email", "linkedin", "instagram", "webform"]).default("email"),
        painPoint: z.string().max(400).default(""),
        product: z.string().min(1).max(160).default("CyberSarah Control Center"),
      }),
    )
    .query(({ input }) => {
      const lead: Lead = {
        company: input.company,
        industry: input.industry,
        employees: input.employees,
        channel: input.channel,
        painPoint: input.painPoint,
      };
      return buildOutreachSequence(lead, input.product);
    }),

  /** Saeule 3: mehrere Leads auf einmal ranken. */
  outreachRank: protectedProcedure
    .input(z.object({ leads: z.array(z.object({
      company: z.string().min(1).max(120),
      industry: z.string().max(80).default("unklar"),
      employees: z.number().int().min(0).max(1_000_000).default(10),
      channel: z.enum(["email", "linkedin", "instagram", "webform"]).default("email"),
      painPoint: z.string().max(400).default(""),
    })).min(1).max(50) }))
    .query(({ input }) => rankLeads(input.leads.map((lead): Lead => lead))),

  /** Kern-Router: Rotator-Status + Fleet-Entscheidung pro Saeule (Admin). */
  rotator: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new Error("Rotator-Einblick ist Administratoren vorbehalten.");
    }
    startRouteRotationAgent();
    const rotation = await getRouteRotationStatus();
    const decisions = PILLARS.map((pillar) =>
      routePillarTask(pillar.id as PillarId, { status: "yellow", headline: "Fleet ungetestet in diesem Kontext.", reasons: [] }, 30_000, []),
    );
    return {
      rotation,
      decisions,
      aggregate: aggregatePillarStatus(PILLARS.map((pillar) => ({ id: pillar.id, status: decisions.some((d) => d.pillar.id === pillar.id) ? "yellow" : "yellow" }))),
    };
  }),
});

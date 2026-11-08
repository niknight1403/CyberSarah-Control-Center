/**
 * tRPC-Router `hubDrafts` — Entwurfs-Abdeckung je Geschaeftsbereich.
 *
 * Der Router ist die Sicht auf den Hub-Draft-Autopiloten: lesen darf jeder
 * angemeldete Nutzer (Coverage, Vorschau, Loop-Definitionen), schreiben nur
 * ein Admin. Geschrieben wird ausschliesslich in die Entwurfs-Queue
 * (`pending`) — keine Veroeffentlichung, kein Versand, keine Preisaenderung.
 *
 * Der Default von `run` ist bewusst der Trockenlauf: ein versehentlicher
 * Aufruf soll hoechstens einen Plan zeigen, keine 30 Entwuerfe anlegen.
 */
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { previewHubDraftAutopilot, runHubDraftAutopilot } from "./hub-draft-autopilot";
import { getDb } from "./db";
import { draftQueue } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import {
  buildCoverage,
  getHubDefinition,
  HUB_DEFINITIONS,
  LOOP_STAGES,
  LOOP_STAGE_LABELS,
} from "../lib/hub-draft-coverage-logic";
import { INFLUENCER_PERSONAS } from "../lib/influencer-persona-logic";

const hubIdSchema = z.enum(["hara", "saas", "loop", "trading", "reach", "faceless", "b2b", "affiliate"]);

async function pendingDraftRows() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload, status: draftQueue.status })
    .from(draftQueue)
    .where(eq(draftQueue.status, "pending"))
    .orderBy(desc(draftQueue.createdAt))
    .limit(500);
  return rows.map((row) => ({ kind: row.kind as string, payload: row.payload, status: row.status as string }));
}

export type HubDraftsDeps = {
  /** Offene Entwuerfe; im Test durch feste Zeilen ersetzt. */
  pendingRows?: () => Promise<{ kind: string; payload: unknown; status: string }[]>;
  runAutopilot?: typeof runHubDraftAutopilot;
  previewAutopilot?: typeof previewHubDraftAutopilot;
};

export function createHubDraftsRouter(deps: HubDraftsDeps = {}) {
  const listPending = deps.pendingRows ?? pendingDraftRows;
  const runAutopilot = deps.runAutopilot ?? runHubDraftAutopilot;
  const previewAutopilot = deps.previewAutopilot ?? previewHubDraftAutopilot;

  return router({
  /** Alle Bereiche mit Zweck, Metrik und den vier Loop-Stufen. */
  hubs: protectedProcedure.query(() =>
    HUB_DEFINITIONS.map((hub) => ({
      id: hub.id,
      label: hub.label,
      purpose: hub.purpose,
      revenueHub: hub.revenueHub,
      personas: hub.personas,
      platforms: hub.platforms,
      metric: hub.metric,
      measurementGap: hub.measurementGap,
      stages: LOOP_STAGES.map((stageName) => ({
        stage: stageName,
        label: LOOP_STAGE_LABELS[stageName],
        intent: hub.stages[stageName].intent,
        formats: hub.stages[stageName].formats,
        cta: hub.stages[stageName].cta,
      })),
    })),
  ),

  /** Ist-Stand: welche Stufe je Bereich bereits einen offenen Entwurf hat. */
  coverage: protectedProcedure
    .input(z.object({ hub: hubIdSchema.optional() }).optional())
    .query(async ({ input }) => {
      const rows = await listPending();
      const hubs = input?.hub ? [input.hub] : undefined;
      const coverage = hubs ? null : buildCoverage(rows);
      if (coverage) {
        return {
          overall: {
            coveragePct: coverage.coveragePct,
            coveredStages: coverage.coveredStages,
            totalStages: coverage.totalStages,
            completeHubs: coverage.completeHubs,
            emptyHubs: coverage.emptyHubs,
          },
          hubs: coverage.hubs,
        };
      }
      // Einzelner Hub: gleiche Rechnung, nur eine Zeile.
      const single = buildCoverage(rows, [input!.hub!]).hubs[0] ?? null;
      return {
        overall: {
          coveragePct: single?.coveragePct ?? 0,
          coveredStages: single?.coveredStages ?? 0,
          totalStages: LOOP_STAGES.length,
          completeHubs: single && single.coveredStages === LOOP_STAGES.length ? [single.hub] : [],
          emptyHubs: single && single.coveredStages === 0 ? [single.hub] : [],
        },
        hubs: single ? [single] : [],
      };
    }),

  /** Vorschau des naechsten Laufs — ohne Schreibzugriff. */
  preview: protectedProcedure.query(() => previewAutopilot()),

  /** KI-Influencer-Persoenlichkeit je Hub: wer bespielt welchen Bereich. */
  personas: protectedProcedure.query(() => {
    const mapping = INFLUENCER_PERSONAS.map((persona) => {
      const hubs = HUB_DEFINITIONS.filter((hub) => hub.personas.includes(persona.id));
      return {
        id: persona.id,
        name: persona.name,
        niche: persona.niche,
        tonality: persona.tonality,
        disclosure: persona.disclosure,
        hubs: hubs.map((hub) => ({
          id: hub.id,
          label: hub.label,
          platforms: hub.platforms,
          metric: hub.metric,
        })),
      };
    });
    return {
      personas: mapping,
      unassignedHubs: HUB_DEFINITIONS.filter(
        (hub) => !hub.personas.some((personaId) => INFLUENCER_PERSONAS.some((persona) => persona.id === personaId)),
      ).map((hub) => hub.id),
    };
  }),

  /** Loop-Engineering-Umsatzmoeglichkeiten je Bereich (Definition, keine Prognose). */
  loops: protectedProcedure.query(() =>
    HUB_DEFINITIONS.map((hub) => ({
      hub: hub.id,
      label: hub.label,
      revenueHub: hub.revenueHub,
      metric: hub.metric,
      measurementGap: hub.measurementGap,
      hypotheses: LOOP_STAGES.map((stageName) => ({
        stage: stageName,
        label: LOOP_STAGE_LABELS[stageName],
        move: hub.stages[stageName].intent,
        cta: hub.stages[stageName].cta,
      })),
      monetization: hub.revenueHub,
      ownerPersona: hub.personas[0],
    })),
  ),

  /**
   * Lauf starten. `dryRun` ist der Default; echte Entwuerfe nur mit
   * `dryRun: false` und Adminrechten.
   */
  run: adminProcedure
    .input(z.object({ dryRun: z.boolean().optional(), hub: hubIdSchema.optional() }).optional())
    .mutation(async ({ input }) => {
      const dryRun = input?.dryRun ?? true;
      const hubs = input?.hub ? [input.hub] : undefined;
      const result = await runAutopilot({ dryRun, hubs });
      const hub = input?.hub ? getHubDefinition(input.hub) : undefined;
      return {
        ...result,
        scope: hub ? { hub: hub.id, label: hub.label } : { hub: null, label: "alle Bereiche" },
      };
    }),
  });
}

/** Produktions-Instanz fuer den App-Router. */
export const hubDraftsRouter = createHubDraftsRouter();

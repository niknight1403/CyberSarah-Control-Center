import { runDraftEngine, type DraftEngineRunResult } from "./draft-engine";
import { runRevenueAutopilot, type RevenueAutopilotRunResult } from "./revenue-autopilot";
import { triggerRevenueScan } from "./revenue-command-service";
import { deriveUltraAutopilotDecision, type UltraAutopilotDecision } from "../lib/ultra-orchestrator-logic";
import { b2bNetworkOverview, refreshInfluencerLearning } from "./growth-network-service";
import { runGrowthPulse } from "./always-on-growth";
import { assertControlCenterAutopilotEnabled } from "../lib/control-center-operator-policy";

export type ControlCenterAutopilotResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  scans: {
    hara: { ok: boolean; detail: string };
    expansion: { ok: boolean; detail: string };
  };
  drafts: DraftEngineRunResult;
  revenue: RevenueAutopilotRunResult;
  growth: {
    influencerPersonasLearned: number;
    influencerExperimentsQueued: number;
    b2bNodes: number;
    b2bQualified: number;
    b2bPartners: number;
    b2bPersonaAssignments: number;
    b2bExpansionQueue: number;
    saasLoopFocus: string;
    saasLoopOwnerPersona: string;
  };
  growthPulse: Awaited<ReturnType<typeof runGrowthPulse>> | null;
  realActions: string[];
  deferred: string[];
  blocked: string[];
  /** Agentforge2/AGI-Agenten adoption: next safe control-loop action. */
  decision: UltraAutopilotDecision;
};

export type ControlCenterAutopilotDeps = {
  scan?: typeof triggerRevenueScan;
  revenue?: typeof runRevenueAutopilot;
  drafts?: typeof runDraftEngine;
  learnInfluencers?: typeof refreshInfluencerLearning;
  b2bOverview?: typeof b2bNetworkOverview;
  growth?: typeof runGrowthPulse;
};

async function scan(path: "hara/scan" | "expansion/scan", trigger: typeof triggerRevenueScan) {
  try {
    const result = await trigger(path);
    return {
      ok: result.accepted === true,
      detail: result.background ? "vom echten Revenue-Worker angenommen" : result.completed ? "vom echten Revenue-Worker abgeschlossen" : "angenommen",
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Scan fehlgeschlagen" };
  }
}

/**
 * Ein echter Control-Center-Autopilot-Lauf.
 * Keine Mock-/Sandbox-Ergebnisse: HARA/Expansion treffen den konfigurierten
 * Revenue-Worker, Revenue-Optimierung nutzt Live-Signale und die Draft-Engine
 * nutzt nur echte konfigurierte LLM-Routen. Externe Veröffentlichungen und
 * Preis-/Geldaktionen bleiben bewusst außerhalb dieses reversiblen Loops.
 */
export async function runControlCenterAutopilot(deps: ControlCenterAutopilotDeps = {}): Promise<ControlCenterAutopilotResult> {
  assertControlCenterAutopilotEnabled(process.env);
  const startedAt = new Date().toISOString();
  const trigger = deps.scan ?? triggerRevenueScan;
  const runRevenue = deps.revenue ?? runRevenueAutopilot;
  const runDrafts = deps.drafts ?? runDraftEngine;
  const learnInfluencers = deps.learnInfluencers ?? refreshInfluencerLearning;
  const getB2BOverview = deps.b2bOverview ?? b2bNetworkOverview;
  const growthRunner = deps.growth ?? runGrowthPulse;

  const [hara, expansion] = await Promise.all([scan("hara/scan", trigger), scan("expansion/scan", trigger)]);
  const revenue = await runRevenue(5);
  const drafts = await runDrafts();
  const [learning, b2b] = await Promise.all([learnInfluencers(), getB2BOverview()]);
  const growth = {
    influencerPersonasLearned: learning.evolutions.length,
    influencerExperimentsQueued: learning.plan.queue.length,
    b2bNodes: b2b.counts.nodes,
    b2bQualified: b2b.counts.qualified,
    b2bPartners: b2b.counts.partners,
    b2bPersonaAssignments: b2b.personaAssignments.length,
    b2bExpansionQueue: b2b.expansionQueue.length,
    saasLoopFocus: b2b.saasLoop.focus,
    saasLoopOwnerPersona: b2b.saasLoop.ownerPersona,
  };

  const realActions: string[] = [];
  let growthPulse: Awaited<ReturnType<typeof runGrowthPulse>> | null = null;
  let growthError: string | null = null;
  try { growthPulse = await growthRunner(); }
  catch (error) { growthError = error instanceof Error ? error.message : "Growth Pulse fehlgeschlagen"; }
  const deferred: string[] = [];
  const blocked: string[] = [];
  if (hara.ok) realActions.push("HARA-Live-Scan gestartet"); else blocked.push(`HARA: ${hara.detail}`);
  if (expansion.ok) realActions.push("Expansion-Live-Scan gestartet"); else blocked.push(`Expansion: ${expansion.detail}`);
  if ((drafts.generated.content ?? 0) > 0) realActions.push(`${drafts.generated.content} Creator-Content-Entwürfe erzeugt`);
  if ((drafts.generated.idea ?? 0) > 0) realActions.push(`${drafts.generated.idea} Produktideen erzeugt`);
  if ((drafts.generated["revenue-loop"] ?? 0) > 0) realActions.push(`${drafts.generated["revenue-loop"]} Revenue-Loop-Entwürfe erzeugt`);
  if (revenue.generated > 0) realActions.push(`${revenue.generated} datenbasierte Revenue-Experimente erzeugt`);
  if (growth.influencerPersonasLearned > 0) realActions.push(`${growth.influencerPersonasLearned} Influencer-Personas aus Live-Signalen weiterentwickelt`);
  if (growth.influencerExperimentsQueued > 0) realActions.push(`${growth.influencerExperimentsQueued} Influencer-Lernexperimente priorisiert`);
  if (growth.b2bQualified > 0) realActions.push(`${growth.b2bQualified} qualifizierte B2B-Beziehungen im Netzwerk bewertet`);
  if (growth.b2bPersonaAssignments > 0) realActions.push(`${growth.b2bPersonaAssignments} B2B-Beziehungen autonom passenden KI-Personas zugeordnet`);
  if (growth.b2bExpansionQueue > 0) realActions.push(`${growth.b2bExpansionQueue} B2B-Expansion-/Nurture-Aktionen priorisiert`);
  realActions.push(`SaaS Loop Engineering: Fokus ${growth.saasLoopFocus}, Owner-Persona ${growth.saasLoopOwnerPersona}`);
  if (growthPulse?.generated) realActions.push(`${growthPulse.generated} datenbasierte Reichweiten-/Funnel-Entwuerfe erzeugt`);
  if (growthError) blocked.push(`Growth Pulse: ${growthError}`);
  for (const item of drafts.skipped) {
    const detail = `${item.kind}: ${item.reason}`;
    if (/\b429\b|quota|rate.?limit|resource_exhausted|too many requests|temporarily deferred|circuit breaker/i.test(item.reason)) deferred.push(detail);
    else blocked.push(detail);
  }

  return {
    ok: hara.ok && expansion.ok && blocked.length === 0 && deferred.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    scans: { hara, expansion },
    drafts,
    revenue,
    growth,
    growthPulse,
    realActions,
    deferred,
    blocked,
    decision: deriveUltraAutopilotDecision({ blocked, deferred, realActions }),
  };
}

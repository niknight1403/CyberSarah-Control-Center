import { runDraftEngine, type DraftEngineRunResult } from "./draft-engine";
import { runRevenueAutopilot, type RevenueAutopilotRunResult } from "./revenue-autopilot";
import { triggerRevenueScan } from "./revenue-command-service";

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
  realActions: string[];
  deferred: string[];
  blocked: string[];
};

export type ControlCenterAutopilotDeps = {
  scan?: typeof triggerRevenueScan;
  revenue?: typeof runRevenueAutopilot;
  drafts?: typeof runDraftEngine;
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
  const startedAt = new Date().toISOString();
  const trigger = deps.scan ?? triggerRevenueScan;
  const runRevenue = deps.revenue ?? runRevenueAutopilot;
  const runDrafts = deps.drafts ?? runDraftEngine;

  const [hara, expansion] = await Promise.all([scan("hara/scan", trigger), scan("expansion/scan", trigger)]);
  const revenue = await runRevenue(5);
  const drafts = await runDrafts();

  const realActions: string[] = [];
  const deferred: string[] = [];
  const blocked: string[] = [];
  if (hara.ok) realActions.push("HARA-Live-Scan gestartet"); else blocked.push(`HARA: ${hara.detail}`);
  if (expansion.ok) realActions.push("Expansion-Live-Scan gestartet"); else blocked.push(`Expansion: ${expansion.detail}`);
  if ((drafts.generated.content ?? 0) > 0) realActions.push(`${drafts.generated.content} Creator-Content-Entwürfe erzeugt`);
  if ((drafts.generated.idea ?? 0) > 0) realActions.push(`${drafts.generated.idea} Produktideen erzeugt`);
  if ((drafts.generated["revenue-loop"] ?? 0) > 0) realActions.push(`${drafts.generated["revenue-loop"]} Revenue-Loop-Entwürfe erzeugt`);
  if (revenue.generated > 0) realActions.push(`${revenue.generated} datenbasierte Revenue-Experimente erzeugt`);
  for (const item of drafts.skipped) {
    const detail = `${item.kind}: ${item.reason}`;
    if (/\b429\b|quota|rate.?limit|resource_exhausted|too many requests|temporarily deferred|circuit breaker/i.test(item.reason)) deferred.push(detail);
    else blocked.push(detail);
  }

  return {
    ok: hara.ok && expansion.ok && blocked.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    scans: { hara, expansion },
    drafts,
    revenue,
    realActions,
    deferred,
    blocked,
  };
}

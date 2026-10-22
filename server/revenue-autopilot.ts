import { getFunnelSummary } from "./analytics-service";
import { fetchRevenueOsSnapshot } from "./revenue-os";
import {
  crossSellOverview,
  expansionOverview,
  haraOverview,
  saasOverview,
} from "./revenue-command-service";
import { insertPendingDraft, listDraftQueue } from "./draft-engine";
import {
  buildRevenueOpportunities,
  revenueAutopilotStatus,
  type RevenueAutopilotSnapshot,
  type RevenueOpportunity,
} from "../lib/revenue-autopilot-logic";
import type { RevenueLoopDraftPayload } from "../lib/draft-engine-logic";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function collectRevenueAutopilotSnapshot(): Promise<RevenueAutopilotSnapshot> {
  const [funnel, saas, revenueOs, crossSell, expansion, hara] = await Promise.all([
    safe(() => getFunnelSummary()),
    safe(() => saasOverview()),
    safe(() => fetchRevenueOsSnapshot()),
    safe(() => crossSellOverview()),
    safe(() => expansionOverview()),
    safe(() => haraOverview()),
  ]);

  const summary = funnel?.summary;
  const affiliateOk = revenueOs?.status === "ok" ? revenueOs : null;
  const crossRules = crossSell?.rules ?? [];
  const recommended = crossRules.reduce((sum, rule) => sum + Number(rule.anzahl_empfohlen ?? 0), 0);
  const converted = crossRules.reduce((sum, rule) => sum + Number(rule.anzahl_konvertiert ?? 0), 0);

  return {
    landingViews: summary?.landingViews ?? 0,
    signups: summary?.signups ?? 0,
    checkoutStarts: summary?.checkoutStarts ?? 0,
    upgrades: summary?.upgrades ?? 0,
    stripeCheckoutStarted: saas?.checkout?.started ?? null,
    stripeCheckoutCompleted: saas?.checkout?.completed ?? null,
    stripeCheckoutSuccessRate: saas?.checkout?.successRate ?? null,
    invoiceSuccessRate: saas?.subscriptions?.invoiceSuccessRate ?? null,
    mrrEur: saas?.subscriptions?.mrrEur ?? null,
    activeSubscriptions: saas?.subscriptions?.active ?? null,
    affiliateClicks: affiliateOk?.affiliateClicks ?? null,
    affiliateConversions: affiliateOk?.affiliateConversions ?? null,
    crossSellRecommended: crossSell ? recommended : null,
    crossSellConverted: crossSell ? converted : null,
    validatedExpansionOpportunities: expansion
      ? expansion.opportunities.filter((item) => item.validiert).length
      : null,
    haraOpenProposals: hara?.counts.open ?? null,
  };
}

export async function revenueAutopilotOverview() {
  const snapshot = await collectRevenueAutopilotSnapshot();
  const opportunities = buildRevenueOpportunities(snapshot);
  return {
    status: revenueAutopilotStatus(opportunities),
    snapshot,
    opportunities,
    generatedAt: new Date().toISOString(),
  };
}

function pendingAutopilotKeys(rows: Awaited<ReturnType<typeof listDraftQueue>>): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "revenue-loop" || row.status !== "pending") continue;
    const payload = row.payload as RevenueLoopDraftPayload;
    if (payload.autopilotKey) keys.add(payload.autopilotKey);
  }
  return keys;
}

export type RevenueAutopilotRunResult = {
  status: ReturnType<typeof revenueAutopilotStatus>;
  generated: number;
  skipped: string[];
  opportunities: RevenueOpportunity[];
};

export async function runRevenueAutopilot(maxDrafts = 3): Promise<RevenueAutopilotRunResult> {
  const snapshot = await collectRevenueAutopilotSnapshot();
  const opportunities = buildRevenueOpportunities(snapshot);
  const status = revenueAutopilotStatus(opportunities);
  const rows = await listDraftQueue(200);
  const pendingKeys = pendingAutopilotKeys(rows);
  let generated = 0;
  const skipped: string[] = [];

  for (const opportunity of opportunities) {
    if (generated >= Math.max(1, Math.min(5, maxDrafts))) break;
    if (pendingKeys.has(opportunity.key)) {
      skipped.push(`${opportunity.key}: bereits offen`);
      continue;
    }

    const payload: RevenueLoopDraftPayload = {
      hub: opportunity.hub,
      name: `AUTO · ${opportunity.title}`,
      hypothesis: opportunity.rationale,
      stages: opportunity.stages,
      metric: opportunity.metric,
      autopilotKey: opportunity.key,
      baseline: opportunity.baseline,
      target: opportunity.target,
      score: opportunity.score,
    };
    await insertPendingDraft("revenue-loop", payload.name, payload, "revenue-autopilot");
    pendingKeys.add(opportunity.key);
    generated += 1;
  }

  return { status, generated, skipped, opportunities };
}

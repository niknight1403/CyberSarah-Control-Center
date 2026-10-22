import { and, eq, sql } from "drizzle-orm";
import { getFunnelSummary } from "./analytics-service";
import { fetchRevenueOsSnapshot } from "./revenue-os";
import {
  crossSellOverview,
  expansionOverview,
  haraOverview,
  saasOverview,
} from "./revenue-command-service";
import { listDraftQueue } from "./draft-engine";
import { getDb } from "./db";
import { draftQueue } from "../drizzle/schema";
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
    landingViews: summary?.landingViews ?? null,
    signups: summary?.signups ?? null,
    checkoutStarts: summary?.checkoutStarts ?? null,
    upgrades: summary?.upgrades ?? null,
    stripeCheckoutStarted: saas?.checkout?.started ?? null,
    stripeCheckoutCompleted: saas?.checkout?.completed ?? null,
    stripeCheckoutSuccessRate: saas?.checkout?.successRate ?? null,
    invoiceSuccessRate: saas?.subscriptions?.invoiceSuccessRate ?? null,
    invoiceAttempts: saas?.subscriptions?.invoiceAttempts ?? null,
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

async function persistAutopilotDraftsAtomic(
  opportunities: RevenueOpportunity[],
  maxDrafts: number,
): Promise<{ generated: number; skipped: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Revenue-Autopilot kann keine Entwuerfe speichern.");

  return db.transaction(async (tx) => {
    // Ein Lauf zur Zeit — verhindert Doppelentwuerfe bei Cron/Admin-Rennen.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cybersarah-revenue-autopilot'))`);

    const pendingRows = await tx
      .select({ payload: draftQueue.payload })
      .from(draftQueue)
      .where(and(eq(draftQueue.kind, "revenue-loop"), eq(draftQueue.status, "pending")));

    const pendingKeys = new Set<string>();
    for (const row of pendingRows) {
      const payload = row.payload as RevenueLoopDraftPayload;
      if (payload.autopilotKey) pendingKeys.add(payload.autopilotKey);
    }

    const totalPendingRevenue = pendingRows.length;
    const availableSlots = Math.max(0, REVENUE_AUTOPILOT_MAX_PENDING - totalPendingRevenue);
    let generated = 0;
    const skipped: string[] = [];

    for (const opportunity of opportunities) {
      if (generated >= Math.min(availableSlots, Math.max(1, Math.min(5, maxDrafts)))) break;
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
      await tx.insert(draftQueue).values({
        kind: "revenue-loop",
        title: payload.name,
        payload,
        status: "pending",
        createdBy: "revenue-autopilot",
      });
      pendingKeys.add(opportunity.key);
      generated += 1;
    }

    if (availableSlots === 0 && opportunities.length > 0) {
      skipped.push("Revenue-Queue voll: zuerst bestehende Experimente pruefen.");
    }
    return { generated, skipped };
  });
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
  const persisted = await persistAutopilotDraftsAtomic(opportunities, maxDrafts);
  return { status, generated: persisted.generated, skipped: persisted.skipped, opportunities };
}

/**
 * One coherent Growth Pulse: reuse the existing 15-min Channel Autopilot and
 * the existing pending approval queue. Never start a competing publishing loop.
 * The central scheduled Control Center cron also calls this module.
 */
import {
  channelAutopilotOverview, collectChannelAutopilotSnapshot, runChannelAutopilot,
} from "./channel-autopilot";
import {
  decideGrowthPlan, growthPulseFingerprint, growthRateCard, growthPulseEnabled,
  type GrowthMetrics,
} from "../lib/always-on-growth-logic";
type Snapshot = Awaited<ReturnType<typeof collectChannelAutopilotSnapshot>>;
function growthMetrics(snapshot: Snapshot): GrowthMetrics {
  return {
    impressions: snapshot.impressions, views: snapshot.views,
    clicks: snapshot.clicks, leads: snapshot.leads,
    purchases: snapshot.purchases, refunds: snapshot.refunds,
    confirmedRevenueCents: snapshot.confirmedRevenueCents,
    published: snapshot.published, failed: snapshot.failed,
    pendingContentDrafts: snapshot.pendingContentDrafts,
    pendingRevenueDrafts: snapshot.pendingRevenueDrafts,
    activeExperiments: snapshot.activeExperiments,
  };
}
export function isGrowthPulseRunning() {
  return growthPulseEnabled(process.env.GROWTH_PULSE, process.env.CHANNEL_AUTOPILOT);
}
export async function growthPulseOverview() {
  const previous = await channelAutopilotOverview();
  const metrics = growthMetrics(previous.snapshot);
  return {
    status: "observe-measure-draft-approve" as const,
    enabled: isGrowthPulseRunning(),
    plan: decideGrowthPlan(metrics),
    metrics,
    rates: growthRateCard(metrics),
    evidenceFingerprint: growthPulseFingerprint(metrics),
    channel: { health: previous.health, decision: previous.decision },
    schedule: "Existing channel loop every 15 minutes while server runs; GitHub cron every 2 hours",
    externalPublishingAuthorized: false as const,
    adSpendingAuthorized: false as const,
    livePriceChangesAuthorized: false as const,
    observedAt: new Date().toISOString(),
  };
}
/** Trigger existing idempotent Channel Autopilot, not a new draft producer. */
export async function runGrowthPulse(): Promise<{
  generated: number; skipped: string | null; focus: string;
  plan: ReturnType<typeof decideGrowthPlan>;
  externalActionsExecuted: 0; executedAt: string;
}> {
  const snapshot = await collectChannelAutopilotSnapshot();
  const plan = decideGrowthPlan(growthMetrics(snapshot));
  if (!isGrowthPulseRunning()) {
    return {
      generated: 0, skipped: "growth-pulse-disabled-by-admin",
      focus: plan.focus, plan, externalActionsExecuted: 0,
      executedAt: new Date().toISOString(),
    };
  }
  if (plan.focus === "QUEUE") {
    return {
      generated: 0, skipped: "approval-backpressure", focus: plan.focus, plan,
      externalActionsExecuted: 0, executedAt: new Date().toISOString(),
    };
  }
  // Existing Channel Autopilot uses a DB advisory transaction lock, evidence
  // fingerprints, pending capacity and 6-hour dedupe for safe repeated triggers.
  const execution = await runChannelAutopilot();
  return {
    generated: execution.generated, skipped: execution.skipped,
    focus: plan.focus, plan, externalActionsExecuted: 0,
    executedAt: new Date().toISOString(),
  };
}

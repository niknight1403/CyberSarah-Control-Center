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
import { auditGrowthMetrics } from "../lib/growth-data-quality";
import { refundRiskPlan } from "../lib/growth-refund-guard";
import { initialGrowthRunState, growthRunStarted, growthRunCompleted, growthRunFailed, growthRuntimeHealth } from "../lib/growth-runtime-state";
import { makeGrowthExecutionGuard } from "../lib/growth-execution-guard";
import { compareGrowthWindows } from "../lib/growth-trend-logic";
import { controlCenterAutopilotEnabled } from "../lib/control-center-operator-policy";
let runtime = initialGrowthRunState();
const executionGuard = makeGrowthExecutionGuard();
let lastMeasuredPlan: ReturnType<typeof decideGrowthPlan> | null = null;
const NO_EVIDENCE_METRICS: GrowthMetrics = {
  impressions: 0, views: 0, clicks: 0, leads: 0, purchases: 0, refunds: 0,
  confirmedRevenueCents: 0, published: 0, failed: 0,
  pendingContentDrafts: 0, pendingRevenueDrafts: 0, activeExperiments: 0,
};
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
  return controlCenterAutopilotEnabled(process.env.CONTROL_CENTER_AUTOPILOT) &&
    growthPulseEnabled(process.env.GROWTH_PULSE, process.env.CHANNEL_AUTOPILOT);
}
/** Admin-only endpoint can still show last in-process diagnostic during DB outage. */
export function growthRuntimeStatus() {
  return {
    enabled: isGrowthPulseRunning(),
    runtime: growthRuntimeHealth(runtime, new Date()),
    lastMeasuredFocus: lastMeasuredPlan?.focus ?? null,
    source: "process-memory" as const,
    databaseQueried: false as const,
    observedAt: new Date().toISOString(),
  };
}
export async function growthPulseOverview() {
  const [previous, recent] = await Promise.all([
    channelAutopilotOverview(), collectChannelAutopilotSnapshot(7),
  ]);
  const metrics = growthMetrics(previous.snapshot);
  const quality = auditGrowthMetrics(metrics, new Date(), previous.snapshot);
  return {
    status: "observe-measure-draft-approve" as const,
    enabled: isGrowthPulseRunning(),
    plan: refundRiskPlan(metrics) ?? decideGrowthPlan(metrics),
    metrics,
    quality,
    runtime: growthRuntimeHealth(runtime, new Date()),
    trend: compareGrowthWindows(growthMetrics(recent), metrics,
      !previous.snapshot.jobsTruncated && !recent.jobsTruncated),
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
async function executeGrowthPulse(): Promise<{
  generated: number; skipped: string | null; focus: string;
  plan: ReturnType<typeof decideGrowthPlan>;
  externalActionsExecuted: 0; executedAt: string;
}> {
  const snapshot = await collectChannelAutopilotSnapshot();
  const metrics = growthMetrics(snapshot);
  const plan = refundRiskPlan(metrics) ?? decideGrowthPlan(metrics);
  lastMeasuredPlan = plan;
  const quality = auditGrowthMetrics(metrics, new Date(), snapshot);
  if (quality.status === "blocked" || snapshot.jobsTruncated) {
    return { generated: 0, skipped: "invalid-growth-data", focus: "DATA", plan,
      externalActionsExecuted: 0, executedAt: new Date().toISOString() };
  }
  // Suspicious cross-platform attribution is for human reconciliation, not new experimentation.
  if (quality.status === "review") {
    return { generated: 0, skipped: "attribution-review-required", focus: "DATA", plan,
      externalActionsExecuted: 0, executedAt: new Date().toISOString() };
  }
  if (!isGrowthPulseRunning()) {
    return {
      generated: 0, skipped: "growth-pulse-disabled-by-admin",
      focus: plan.focus, plan, externalActionsExecuted: 0,
      executedAt: new Date().toISOString(),
    };
  }
  if (plan.focus === "REFUNDS") {
    return { generated: 0, skipped: "refund-risk-review", focus: plan.focus, plan,
      externalActionsExecuted: 0, executedAt: new Date().toISOString() };
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


/** Process-local observable lifecycle, independent of successful drafts. */
export async function runGrowthPulse(): Promise<Awaited<ReturnType<typeof executeGrowthPulse>>> {
  if (!executionGuard.acquire()) {
    // Never issue a second database query while the original Growth Pulse holds its lock.
    const plan = lastMeasuredPlan ?? decideGrowthPlan(NO_EVIDENCE_METRICS);
    return { generated: 0, skipped: "run-already-in-progress", focus: plan.focus,
      plan, externalActionsExecuted: 0, executedAt: new Date().toISOString() };
  }
  runtime = growthRunStarted(runtime, new Date());
  try {
    const result = await executeGrowthPulse();
    runtime = growthRunCompleted(runtime, result, new Date());
    return result;
  } catch (error) {
    runtime = growthRunFailed(runtime, new Date());
    throw error;
  } finally {
    executionGuard.release();
  }
}

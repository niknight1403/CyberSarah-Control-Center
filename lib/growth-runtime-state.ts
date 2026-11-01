export type GrowthRunState = {
  startedAt: string | null;
  completedAt: string | null;
  lastOutcome: "none" | "drafts" | "no-change" | "blocked" | "paused" | "failed";
  lastReason: string | null;
  consecutiveFailures: number;
  runsObserved: number;
};
export const initialGrowthRunState = (): GrowthRunState => ({
  startedAt: null, completedAt: null, lastOutcome: "none",
  lastReason: null, consecutiveFailures: 0, runsObserved: 0,
});
export function growthRunStarted(state: GrowthRunState, time: Date): GrowthRunState {
  return { ...state, startedAt: time.toISOString(), runsObserved: state.runsObserved + 1 };
}
export function growthRunCompleted(
  state: GrowthRunState, result: { generated: number; skipped: string | null },
  time: Date,
): GrowthRunState {
  const paused = result.skipped === "growth-pulse-disabled-by-admin";
  const blocked = result.skipped === "invalid-growth-data" ||
    result.skipped === "incomplete-job-history" || result.skipped === "refund-risk-review" ||
    result.skipped === "attribution-review-required" || result.skipped === "approval-backpressure";
  return { ...state, completedAt: time.toISOString(),
    lastOutcome: paused ? "paused" : blocked ? "blocked" : result.generated > 0 ? "drafts" : "no-change",
    lastReason: result.skipped, consecutiveFailures: 0 };
}
export function growthRunFailed(state: GrowthRunState, time: Date): GrowthRunState {
  return { ...state, completedAt: time.toISOString(), lastOutcome: "failed",
    lastReason: "growth-run-failed", consecutiveFailures: state.consecutiveFailures + 1 };
}
export function growthRuntimeHealth(state: GrowthRunState, now: Date, expectedMinutes = 120) {
  const reference = state.completedAt ?? state.startedAt;
  const elapsedMinutes = reference ? Math.max(0, (now.getTime() - Date.parse(reference)) / 60_000) : null;
  const stale = elapsedMinutes === null || !Number.isFinite(elapsedMinutes) || elapsedMinutes > expectedMinutes * 1.5;
  return { ...state, stale, elapsedMinutes: elapsedMinutes === null ? null : Math.round(elapsedMinutes),
    advisory: "Prozesslokale Diagnose; keine Garantie fuer 24/7-Worker oder Cron-Zustellung." };
}

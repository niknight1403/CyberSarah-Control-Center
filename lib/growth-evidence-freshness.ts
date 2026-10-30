/**
 * Evidence timestamps protect against acting on stale platform/Stripe observations.
 * A successful cron run is not itself evidence that marketing measurements are fresh.
 */
export function latestGrowthEvidence(...timestamps: (Date | string | null | undefined)[]) {
  let latest: number | null = null;
  for (const value of timestamps) {
    if (!value) continue;
    const ms = value instanceof Date ? value.getTime() : Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    latest = latest === null ? ms : Math.max(latest, ms);
  }
  return latest === null ? null : new Date(latest).toISOString();
}
export function growthEvidenceFreshness(latest: string | null | undefined, now: Date, maxAgeHours = 72) {
  const at = latest ? Date.parse(latest) : NaN;
  const elapsedHours = Number.isFinite(at) ? (now.getTime() - at) / 3_600_000 : null;
  return {
    latestAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
    ageHours: elapsedHours === null ? null : Math.max(0, Math.round(elapsedHours * 10) / 10),
    fresh: elapsedHours !== null && elapsedHours >= -1 && elapsedHours <= maxAgeHours,
    maxAgeHours,
  };
}

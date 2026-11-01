/**
 * Mobile API + database readiness. A "ready" label is permitted only after
 * an actual successful /api/ready response that explicitly confirms the DB.
 * This is intentionally not an LLM, Stripe, or full-system health claim.
 */
export type MobileProbeOutcome = "ready" | "degraded" | "unreachable";
export type MobileReadinessSample = { outcome: MobileProbeOutcome; checkedAtMs: number };
export type MobileReadinessState = MobileProbeOutcome | "checking" | "stale";
export type MobileReadinessView = {
  state: MobileReadinessState;
  label: string;
  detail: string;
  accent: "green" | "amber" | "red" | "cyan";
};
export const MOBILE_READINESS_STALE_AFTER_MS = 120_000;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** A 503 with a confirmed DB failure is degraded, not falsely "offline". */
export function classifyReadinessHttp(status: number, payload: unknown): MobileProbeOutcome {
  const body = recordOf(payload);
  const checks = recordOf(body?.checks);
  if (status === 200 && body?.ok === true && checks?.database === true) return "ready";
  if (status === 503 && body?.ok === false && checks?.database === false) return "degraded";
  return "unreachable";
}

/** Validity and freshness always take precedence over an old green result. */
export function describeMobileReadiness(
  sample: MobileReadinessSample | null | undefined,
  nowMs: number,
): MobileReadinessView {
  if (!sample) {
    return { state: "checking", label: "Prüfe …", detail: "API und Datenbank werden geprüft.", accent: "cyan" };
  }
  if (!Number.isFinite(sample.checkedAtMs) || !Number.isFinite(nowMs)
      || sample.checkedAtMs < 0 || nowMs < sample.checkedAtMs
      || nowMs - sample.checkedAtMs >= MOBILE_READINESS_STALE_AFTER_MS) {
    return { state: "stale", label: "Ungeprüft", detail: "Letzte Bereitschaftsprüfung ist veraltet. Bitte aktualisieren.", accent: "amber" };
  }
  if (sample.outcome === "ready") {
    return { state: "ready", label: "Bereit", detail: "API und Datenbank haben die letzte Prüfung bestanden.", accent: "green" };
  }
  if (sample.outcome === "degraded") {
    return { state: "degraded", label: "Eingeschränkt", detail: "API antwortet, Datenbank ist derzeit nicht bereit.", accent: "amber" };
  }
  return { state: "unreachable", label: "Nicht erreichbar", detail: "API-/Datenbankbereitschaft konnte nicht bestätigt werden.", accent: "red" };
}

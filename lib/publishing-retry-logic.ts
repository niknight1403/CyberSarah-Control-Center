/**
 * Kontrollierte Wiederaufnahme fehlgeschlagener Publikations-Jobs (reine Logik).
 *
 * Warum nicht einfach "alles nochmal": Ein fehlgeschlagener Job ist nicht immer
 * wiederholbar. Inhaltliche Ablehnungen (Richtlinie, Medium, Kontingent) werden
 * durch Wiederholung nicht besser, und ein Job, der den Provider schon erreicht
 * hat (mode gesetzt), darf niemals doppelt gesendet werden. Diese Datei
 * entscheidet deshalb je Job, ob eine Wiederholung vertretbar ist, mit welchem
 * Abstand und ob vorher ein Token erneuert werden muss.
 *
 * Keine Seiteneffekte: keine DB, kein HTTP, keine Zeit ausser der uebergebenen.
 */

import {
  classifyPublishingFailure,
  type PublishingFailureCause,
} from "./publishing-failure-reasons-logic";

/** Obergrenze automatischer Versuche je Job (danach nur noch manuell). */
export const SYSTEM_RETRY_ATTEMPT_CAP = 3;
/** Harte Obergrenze, wie viele Jobs ein Lauf anfassen darf. */
export const SYSTEM_RETRY_MAX_PER_RUN = 25;

/** Nur diese Ursachen rechtfertigen eine automatische Wiederholung. */
export const AUTO_RETRYABLE_CAUSES: PublishingFailureCause[] = ["auth", "rate_limit", "network"];

export type RetryJobInput = {
  id: number;
  platform: string;
  status: string;
  attempts: number;
  lastError: string | null;
  mode: string | null;
};

export type RetryDecision = {
  id: number;
  decision: "retry" | "skip";
  cause: PublishingFailureCause;
  reason: string;
  delayMs: number;
  needsTokenRefresh: boolean;
};

export type RetryPlan = {
  retries: RetryDecision[];
  skipped: RetryDecision[];
};

/** Wartezeit bis zum naechsten Versuch, nach Ursache. */
export function retryDelayMs(cause: PublishingFailureCause): number {
  switch (cause) {
    case "rate_limit": return 15 * 60_000;
    case "auth": return 60_000;
    case "network": return 2 * 60_000;
    default: return 0;
  }
}

/**
 * Entscheidet je Job. `tokenReady` sagt, ob fuer die Plattform aktuell ein
 * verwendbares Token vorliegt — bei auth-Fehlern wird sonst nicht sinnlos
 * erneut gesendet.
 */
export function planFailedJobRetries(input: {
  jobs: RetryJobInput[];
  limit: number;
  attemptCap?: number;
  tokenReady?: (platform: string) => boolean;
}): RetryPlan {
  const cap = Math.max(1, Math.trunc(input.attemptCap ?? SYSTEM_RETRY_ATTEMPT_CAP));
  const limit = Math.max(0, Math.min(Math.trunc(input.limit), SYSTEM_RETRY_MAX_PER_RUN));
  const plan: RetryPlan = { retries: [], skipped: [] };

  for (const job of input.jobs) {
    const classified = classifyPublishingFailure(job.lastError);
    const base = {
      id: job.id,
      cause: classified.cause,
      delayMs: 0,
      needsTokenRefresh: false,
    };

    if (job.status !== "fehlgeschlagen") {
      plan.skipped.push({ ...base, decision: "skip", reason: "status_nicht_fehlgeschlagen" });
      continue;
    }
    if (job.mode) {
      // Provider hat den Job bereits erreicht: Wiederholung koennte doppelt posten.
      plan.skipped.push({ ...base, decision: "skip", reason: "provider_bereits_erreicht" });
      continue;
    }
    if (job.attempts >= cap) {
      plan.skipped.push({ ...base, decision: "skip", reason: "versuchslimit_erreicht" });
      continue;
    }
    if (!AUTO_RETRYABLE_CAUSES.includes(classified.cause)) {
      plan.skipped.push({ ...base, decision: "skip", reason: `nicht_wiederholbar_${classified.cause}` });
      continue;
    }
    if (plan.retries.length >= limit) {
      plan.skipped.push({ ...base, decision: "skip", reason: "lauf_limit_erreicht" });
      continue;
    }
    const needsTokenRefresh = classified.cause === "auth";
    if (needsTokenRefresh && input.tokenReady && !input.tokenReady(job.platform)) {
      plan.skipped.push({ ...base, decision: "skip", reason: "auth_ohne_verwendbares_token" });
      continue;
    }
    plan.retries.push({
      ...base,
      decision: "retry",
      reason: `wiederholbar_${classified.cause}`,
      delayMs: retryDelayMs(classified.cause),
      needsTokenRefresh,
    });
  }
  return plan;
}

/** Kurzfassung eines Laufs fuer Logs und Antwort. */
export function summarizeRetryPlan(plan: RetryPlan): string {
  return `${plan.retries.length} zur Wiederholung, ${plan.skipped.length} uebersprungen`;
}

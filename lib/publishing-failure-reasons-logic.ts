/**
 * Sprint 44 - Publikationsfehler nach Ursache und Provider getrennt anzeigen.
 *
 * Reine Logik, keine Seiteneffekte. Grundsaetze:
 * - Nur tatsaechlich gespeicherte Fehlertexte werden ausgewertet. Jobs ohne
 *   Fehlertext verschwinden nicht, sondern landen als "ohne Fehlertext" im Bericht.
 * - Die Ursachenzuordnung ist eine Heuristik auf dem Fehlertext und wird als
 *   solche benannt; sie ersetzt keine Provider-Diagnose.
 * - Retry-Faehigkeit ist eine Empfehlung, keine Zusage. Versand-unklar bleibt
 *   immer manuell zu pruefen.
 */
import { isPermanentCredentialFailure } from "./publishing-auto-resolution-logic";

export type PublishingFailureCause =
  | "auth"
  | "rate_limit"
  | "quota"
  | "media_rejected"
  | "policy_rejected"
  | "network"
  | "provider_unconfirmed"
  | "unknown";

export interface PublishingFailureJob {
  platform: string;
  status: string;
  attempts: number;
  lastError: string | null;
}

export interface ClassifiedPublishingFailure {
  cause: PublishingFailureCause;
  retryable: boolean;
  hint: string;
}

const HINTS: Record<PublishingFailureCause, string> = {
  auth: "Zugangsdaten oder Berechtigungen des Providers pruefen.",
  rate_limit: "Provider-Limit erreicht; spaeter erneut versuchen.",
  quota: "Kontingent oder Zeichenlimit pruefen, Inhalt kuerzen.",
  media_rejected: "Medium abgelehnt; Format, Groesse und Rechte pruefen.",
  policy_rejected: "Inhalt entspricht nicht den Provider-Richtlinien; Text anpassen.",
  network: "Netzwerk- oder Timeout-Fehler; Wiederholung ist unkritisch.",
  provider_unconfirmed: "Versand ungeklaert: erst Quittung beim Provider pruefen, dann entscheiden.",
  unknown: "Ursache unklar; Fehlertext und Provider-Log pruefen.",
};

export function classifyPublishingFailure(message: string | null | undefined): ClassifiedPublishingFailure {
  const text = (message ?? "").toLowerCase();
  if (!text.trim()) return { cause: "unknown", retryable: false, hint: HINTS.unknown };

  const cause: PublishingFailureCause =
    /quarantaene|quarantine|versand ungekl|nicht bestaetigt|blieb aus/.test(text)
      ? "provider_unconfirmed"
      : /401|403|unauthor|forbidden|token.*(abgelaufen|expired|invalid)|invalid.*token|permission/.test(text)
        ? "auth"
        : /429|rate.?limit|too many requests/.test(text)
          ? "rate_limit"
          : /quota|kontingent|limit erreicht|limit exceeded|character limit/.test(text)
            ? "quota"
            : /media|bild|image|video|datei zu gross|file too large|unsupported (media|format)/.test(text)
              ? "media_rejected"
              : /policy|richtlinie|violat|blocked by|community guidelines/.test(text)
                ? "policy_rejected"
                : /econn|etimedout|timeout|network|socket|fetch failed|dns/.test(text)
                  ? "network"
                  : "unknown";

  const retryable = cause === "rate_limit" || cause === "network";
  return { cause, retryable, hint: HINTS[cause] };
}

export interface FailurePlatformSummary {
  platform: string;
  failures: number;
  retryable: number;
  manualReview: number;
  topCause: PublishingFailureCause | null;
  lastError: string | null;
}

export interface FailureCauseSummary {
  cause: PublishingFailureCause;
  count: number;
  platforms: string[];
  hint: string;
}

export interface PublishingFailureReport {
  totalFailedJobs: number;
  withErrorText: number;
  withoutErrorText: number;
  retryable: number;
  manualReview: number;
  byPlatform: FailurePlatformSummary[];
  byCause: FailureCauseSummary[];
  note: string;
}

const FAILED_STATUSES = new Set(["fehlgeschlagen", "versand_ungeklaert"]);

function maskForDisplay(message: string): string {
  return message
    .replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{6,}\b/g, "[key]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .slice(0, 240);
}

/** Gruppiert gespeicherte Publishing-Fehler nach Provider und Ursache. */
export function groupPublishingFailures(jobs: readonly PublishingFailureJob[]): PublishingFailureReport {
  const failed = jobs.filter(job => FAILED_STATUSES.has(job.status));
  const platformMap = new Map<string, { failures: number; retryable: number; manualReview: number; causes: Map<PublishingFailureCause, number>; lastError: string | null }>();
  const causeMap = new Map<PublishingFailureCause, { count: number; platforms: Set<string> }>();
  let withErrorText = 0;
  let retryable = 0;
  let manualReview = 0;

  for (const job of failed) {
    const classified = classifyPublishingFailure(job.lastError);
    const hasText = Boolean(job.lastError && job.lastError.trim());
    if (hasText) withErrorText += 1;
    if (job.status === "versand_ungeklaert" || !classified.retryable) manualReview += 1;
    if (classified.retryable && job.status !== "versand_ungeklaert") retryable += 1;

    const platform = job.platform || "unbekannt";
    const entry = platformMap.get(platform) ?? { failures: 0, retryable: 0, manualReview: 0, causes: new Map(), lastError: null };
    entry.failures += 1;
    if (classified.retryable && job.status !== "versand_ungeklaert") entry.retryable += 1;
    if (job.status === "versand_ungeklaert" || !classified.retryable) entry.manualReview += 1;
    entry.causes.set(classified.cause, (entry.causes.get(classified.cause) ?? 0) + 1);
    if (hasText) entry.lastError = maskForDisplay(job.lastError!);
    platformMap.set(platform, entry);

    const causeEntry = causeMap.get(classified.cause) ?? { count: 0, platforms: new Set<string>() };
    causeEntry.count += 1;
    causeEntry.platforms.add(platform);
    causeMap.set(classified.cause, causeEntry);
  }

  const byPlatform: FailurePlatformSummary[] = [...platformMap.entries()]
    .map(([platform, entry]) => {
      const topCause = [...entry.causes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
      return {
        platform,
        failures: entry.failures,
        retryable: entry.retryable,
        manualReview: entry.manualReview,
        topCause,
        lastError: entry.lastError,
      };
    })
    .sort((a, b) => b.failures - a.failures || a.platform.localeCompare(b.platform));

  const byCause: FailureCauseSummary[] = [...causeMap.entries()]
    .map(([cause, entry]) => ({
      cause,
      count: entry.count,
      platforms: [...entry.platforms].sort(),
      hint: HINTS[cause],
    }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));

  const note =
    failed.length === 0
      ? "Keine fehlgeschlagenen Publishing-Jobs im betrachteten Zeitraum."
      : "Ursachen sind aus gespeicherten Fehlertexten abgeleitet (Heuristik); Versand-unklar bleibt manuelle Pruefung.";

  return {
    totalFailedJobs: failed.length,
    withErrorText,
    withoutErrorText: failed.length - withErrorText,
    retryable,
    manualReview,
    byPlatform,
    byCause,
    note,
  };
}

/**
 * Sprint 11.4 - "Unklar" ist nicht immer dasselbe.
 *
 * Ein Vorgang kann unklar sein, weil der Beitrag wirklich nicht auffindbar ist,
 * oder weil der Zugang zur Plattform selbst unbrauchbar ist (abgelehnter
 * Token). Beides landet im gleichen Zaehler und verlangt unterschiedliche
 * Schritte: der eine eine menschliche Entscheidung, der andere eine neue
 * Autorisierung. Ohne diese Trennung steht in der Oberflaeche "19 unklar" und
 * niemand weiss, was zu tun ist.
 */
export interface UncertainCredentialBlocker {
  platform: string;
  jobs: number;
  detail: string | null;
}

export interface UncertainBlockerSummary {
  uncertain: number;
  credentialsBlocked: UncertainCredentialBlocker[];
  guidance: string[];
  note: string;
}

export function summarizeUncertainBlockers(jobs: readonly PublishingFailureJob[]): UncertainBlockerSummary {
  const uncertain = jobs.filter(job => job.status === "versand_ungeklaert");
  const map = new Map<string, { jobs: number; detail: string | null }>();
  for (const job of uncertain) {
    const text = job.lastError ?? "";
    if (!text.trim() || !isPermanentCredentialFailure(text)) continue;
    const platform = job.platform || "unbekannt";
    const entry = map.get(platform) ?? { jobs: 0, detail: null };
    entry.jobs += 1;
    if (!entry.detail) entry.detail = maskForDisplay(text);
    map.set(platform, entry);
  }
  const credentialsBlocked = [...map.entries()]
    .map(([platform, entry]) => ({ platform, jobs: entry.jobs, detail: entry.detail }))
    .sort((a, b) => b.jobs - a.jobs || a.platform.localeCompare(b.platform));

  const blockedJobs = credentialsBlocked.reduce((sum, entry) => sum + entry.jobs, 0);
  const guidance = credentialsBlocked.map(entry =>
    `${entry.platform.toUpperCase()}: ${entry.jobs} unklare Vorgaenge warten auf einen gueltigen Zugang, nicht auf eine Entscheidung. Zugang neu autorisieren, dann prueft der naechste Lauf erneut.`,
  );
  const note = uncertain.length === 0
    ? "Keine unklaren Vorgaenge im betrachteten Zeitraum."
    : blockedJobs === 0
      ? "Alle unklaren Vorgaenge brauchen eine menschliche Entscheidung."
      : `${blockedJobs} von ${uncertain.length} unklaren Vorgaengen sind durch einen unbrauchbaren Zugang blockiert, nicht durch fehlende Informationen.`;

  return { uncertain: uncertain.length, credentialsBlocked, guidance, note };
}

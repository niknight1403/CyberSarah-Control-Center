import { buildChangelog, renderChangelog } from "./changelog-logic";
import {
  validateReleasePreflight,
  type ReleasePreflightInput,
  type ReleasePreflightIssue,
} from "./release-preflight-logic";

/**
 * Release-Handoff (Sprint 49): Der Preflight erzeugt aus Conventional-Commit-
 * Betreffzeilen ein redigiertes Changelog und haengt es an das Handoff-
 * Artefakt an. Das Changelog ist tokenfrei: sensible Muster und URLs werden
 * vor dem Anhaengen redigiert. Bei ungueltiger Version entfaellt das
 * Changelog sichtbar begruendet.
 */
export type ReleaseHandoffMetadata = {
  repository?: string;
  ref?: string;
  commit?: string;
  runId?: string;
  runAttempt?: string;
  status?: string;
};

export type ReleaseHandoffInput = {
  preflight: ReleasePreflightInput;
  commitSubjects?: unknown;
  metadata?: ReleaseHandoffMetadata;
};

export type ReleaseHandoff = {
  schemaVersion: 2;
  generatedAt: string;
  repository: string;
  ref: string;
  commit: string;
  runId: string;
  runAttempt: string;
  status: string;
  preflight: {
    ok: boolean;
    issues: ReleasePreflightIssue[];
    normalized: ReturnType<typeof validateReleasePreflight>["normalized"];
  };
  changelog: {
    version: string;
    markdown: string;
    entryCount: number;
    unclassifiedCount: number;
  } | null;
  changelogIssue: string | null;
  secretsIncluded: false;
};

const ALLOWED_STATUS = new Set(["passed", "failed", "cancelled", "started"]);
const CHANGELOG_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Baut das vollstaendige Handoff-Artefakt deterministisch: Der Preflight
 * wird ausgefuehrt, sein Ergebnis inklusiveIssues uebernommen und aus den
 * Conventional-Commit-Betreffzeilen das redigierte Changelog erzeugt.
 * `nowIso` muss ein endlicher ISO-Zeitpunkt sein; ungueltige Eingaben
 * werden deterministisch abgelehnt.
 */
export function buildReleaseHandoff(input: ReleaseHandoffInput, nowIso: string): ReleaseHandoff {
  if (typeof nowIso !== "string" || !Number.isFinite(Date.parse(nowIso))) {
    throw new Error("Ein endlicher ISO-Zeitpunkt ist erforderlich.");
  }
  if (typeof input !== "object" || input === null) {
    throw new Error("Eine Preflight-Eingabe ist erforderlich.");
  }

  if (input.commitSubjects !== undefined && !Array.isArray(input.commitSubjects)) {
    throw new Error("Betreffzeilen muessen ein Array aus Zeichenketten sein.");
  }
  if (Array.isArray(input.commitSubjects) && input.commitSubjects.some((subject) => typeof subject !== "string")) {
    throw new Error("Betreffzeilen muessen ein Array aus Zeichenketten sein.");
  }
  const subjects = Array.isArray(input.commitSubjects) ? (input.commitSubjects as string[]) : [];

  const preflight = validateReleasePreflight(input.preflight);
  const metadata = input.metadata ?? {};
  const status = typeof metadata.status === "string" && ALLOWED_STATUS.has(metadata.status) ? metadata.status : "unknown";

  let changelog: ReleaseHandoff["changelog"] = null;
  let changelogIssue: string | null = null;
  if (!CHANGELOG_VERSION_PATTERN.test(preflight.normalized.version)) {
    changelogIssue =
      preflight.normalized.version === ""
        ? "Changelog entfaellt: keine Version angegeben."
        : `Changelog entfaellt: Version '${preflight.normalized.version}' genuegt nicht dem Schema major.minor.patch.`;
  } else {
    const built = buildChangelog(preflight.normalized.version, subjects);
    changelog = {
      version: built.version,
      markdown: renderChangelog(built),
      entryCount: built.entryCount,
      unclassifiedCount: built.unclassifiedCount,
    };
  }

  return {
    schemaVersion: 2,
    generatedAt: nowIso,
    repository: metadata.repository ?? "local",
    ref: metadata.ref ?? "local",
    commit: metadata.commit ?? "local",
    runId: metadata.runId ?? "local",
    runAttempt: metadata.runAttempt ?? "1",
    status,
    preflight: {
      ok: preflight.ok,
      issues: preflight.issues,
      normalized: preflight.normalized,
    },
    changelog,
    changelogIssue,
    secretsIncluded: false,
  };
}

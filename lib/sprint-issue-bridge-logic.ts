/**
 * Sprint 292 — Autonome Entwicklung: Sprint-Ziele als GitHub-Issue (bestehende Tools nutzen)
 *
 * Reine, deterministische Logik fuer die Kopplung von Sprint-Zielen mit GitHub-Issues.
 * Transformiert Sprint-Spezifikationen in strukturierte GitHub-Issue-Payloads, parst
 * bestehende Sprint-Issues (Fortschritt, Checklisten), bestimmt erforderliche
 * Synchronisations-Aktionen (create_github_issue vs. close_github_issue) und
 * formatiert Statusberichte fuer den autonomen Agenten.
 */

export type SprintGoalSpec = {
  sprintNumber: number;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  series?: string;
  status?: "OFFEN" | "IN_BEARBEITUNG" | "ERLEDIGT";
};

export type GitHubIssuePayload = {
  title: string;
  body: string;
  labels: string[];
};

export type ExistingGitHubIssue = {
  number: number;
  title: string;
  body?: string;
  state?: string;
  labels?: (string | { name?: string })[];
};

export type ParsedSprintIssue = {
  sprintNumber: number;
  issueNumber?: number;
  title: string;
  status: "open" | "closed";
  completedCriteriaCount: number;
  totalCriteriaCount: number;
  progressPercent: number;
  isComplete: boolean;
  labels: string[];
};

export type SprintIssueSyncAction = {
  action: "create" | "close" | "noop";
  payload?: GitHubIssuePayload;
  issueNumberToClose?: number;
  reason: string;
};

/**
 * Wandelt ein Sprint-Ziel in eine strukturierte GitHub-Issue-Payload um.
 */
export function convertSprintGoalToIssuePayload(sprint: SprintGoalSpec): GitHubIssuePayload {
  const sprintTitle = `[Sprint ${sprint.sprintNumber}] ${sprint.title.trim()}`;
  const seriesLabel = sprint.series ? sprint.series.toLowerCase().replace(/\s+/g, "-") : "serie-a";

  const criteriaList = sprint.acceptanceCriteria.length > 0
    ? sprint.acceptanceCriteria.map((c) => `- [ ] ${c.trim()}`).join("\n")
    : "- [ ] Sprint-Implementierung vollstaendig und Tests grün";

  const bodyLines = [
    `## Sprint-Ziel ${sprint.sprintNumber}`,
    ``,
    sprint.description.trim(),
    ``,
    `### Akzeptanzkriterien`,
    criteriaList,
    ``,
    `---`,
    `*Automatisches Sprint-Issue für autonome Entwicklung (Sprint 292)*`,
  ];

  return {
    title: sprintTitle,
    body: bodyLines.join("\n"),
    labels: ["sprint-goal", "autonom-dev", seriesLabel],
  };
}

/**
 * Parst ein bestehendes GitHub-Issue und berechnet den Sprint-Fortschritt anhand der Checkliste.
 */
export function parseSprintIssue(issue: ExistingGitHubIssue): ParsedSprintIssue {
  const title = issue.title ?? "";
  const match = title.match(/\[Sprint\s+(\d+)\]\s*(.+)/i);
  const sprintNumber = match ? parseInt(match[1], 10) : 0;
  const body = issue.body ?? "";

  const checkedCount = (body.match(/- \[[xX]\]/g) || []).length;
  const uncheckedCount = (body.match(/- \[\s*\]/g) || []).length;
  const totalCriteriaCount = checkedCount + uncheckedCount;

  const progressPercent = totalCriteriaCount > 0
    ? Math.round((checkedCount / totalCriteriaCount) * 100)
    : (issue.state === "closed" ? 100 : 0);

  const isComplete = issue.state === "closed" || (totalCriteriaCount > 0 && checkedCount === totalCriteriaCount);

  const rawLabels = issue.labels ?? [];
  const labels = rawLabels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean);

  return {
    sprintNumber,
    issueNumber: issue.number,
    title,
    status: issue.state === "closed" ? "closed" : "open",
    completedCriteriaCount: checkedCount,
    totalCriteriaCount,
    progressPercent,
    isComplete,
    labels,
  };
}

/**
 * Ermittelt, welche bestehenden Tools (`create_github_issue` / `close_github_issue`)
 * aufgerufen werden muessen, um das Sprint-Ziel auf GitHub abzubilden.
 */
export function determineSprintIssueSyncAction(
  sprint: SprintGoalSpec,
  existingIssues: ExistingGitHubIssue[]
): SprintIssueSyncAction {
  const existingForSprint = existingIssues.find((issue) => {
    const parsed = parseSprintIssue(issue);
    return parsed.sprintNumber === sprint.sprintNumber;
  });

  // Sprint ist lokal ERLEDIGT
  if (sprint.status === "ERLEDIGT") {
    if (existingForSprint && existingForSprint.state !== "closed") {
      return {
        action: "close",
        issueNumberToClose: existingForSprint.number,
        reason: `Sprint ${sprint.sprintNumber} ist lokal abgeschlossen, aber Issue #${existingForSprint.number} ist noch offen. Close erforderlich.`,
      };
    }
    return {
      action: "noop",
      reason: `Sprint ${sprint.sprintNumber} ist erledigt und Issue ist bereits geschlossen oder nicht vorhanden.`,
    };
  }

  // Sprint ist OFFEN oder IN_BEARBEITUNG
  if (!existingForSprint) {
    const payload = convertSprintGoalToIssuePayload(sprint);
    return {
      action: "create",
      payload,
      reason: `Kein bestehendes GitHub-Issue fuer Sprint ${sprint.sprintNumber} gefunden. Erstellung erforderlich.`,
    };
  }

  return {
    action: "noop",
    reason: `Offenes Issue #${existingForSprint.number} fuer Sprint ${sprint.sprintNumber} existiert bereits.`,
  };
}

/**
 * Formatiert den Sprint-Issue-Bericht fuer den Agenten-Kontext.
 */
export function formatSprintIssueReport(parsed: ParsedSprintIssue): string {
  const statusEmoji = parsed.isComplete ? "✅" : "⏳";
  const issueRef = parsed.issueNumber ? `#${parsed.issueNumber}` : "ohne ID";

  return [
    `${statusEmoji} **Sprint-Issue ${parsed.sprintNumber}** (${issueRef}): ${parsed.title}`,
    `Status: ${parsed.status.toUpperCase()} | Fortschritt: ${parsed.progressPercent}% (${parsed.completedCriteriaCount}/${parsed.totalCriteriaCount} Kriterien abgehakt)`,
    parsed.labels.length > 0 ? `Labels: ${parsed.labels.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

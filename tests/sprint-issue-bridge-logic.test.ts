import { describe, expect, it } from "vitest";
import {
  convertSprintGoalToIssuePayload,
  parseSprintIssue,
  determineSprintIssueSyncAction,
  formatSprintIssueReport,
  SprintGoalSpec,
} from "../lib/sprint-issue-bridge-logic";

describe("Sprint 292 — Autonome Entwicklung: Sprint-Ziele als GitHub-Issue", () => {
  const sampleSprint: SprintGoalSpec = {
    sprintNumber: 292,
    title: "Autonome Entwicklung: Sprint-Ziele als GitHub-Issue",
    description: "Bestehende Werkzeuge nutzen, um Sprint-Ziele als Issue abzubilden.",
    acceptanceCriteria: [
      "Sprint-Ziel in Issue-Payload konvertierbar",
      "Checklisten-Fortschritt parsen",
      "Koppelung an create_github_issue / close_github_issue",
    ],
    series: "Serie A",
    status: "OFFEN",
  };

  it("konvertiert ein Sprint-Ziel in eine korrekte GitHub-Issue-Payload", () => {
    const payload = convertSprintGoalToIssuePayload(sampleSprint);

    expect(payload.title).toBe("[Sprint 292] Autonome Entwicklung: Sprint-Ziele als GitHub-Issue");
    expect(payload.body).toContain("## Sprint-Ziel 292");
    expect(payload.body).toContain("- [ ] Sprint-Ziel in Issue-Payload konvertierbar");
    expect(payload.labels).toContain("sprint-goal");
    expect(payload.labels).toContain("autonom-dev");
  });

  it("parst bestehende GitHub-Issues und berechnet Checklisten-Fortschritt", () => {
    const rawIssue = {
      number: 42,
      title: "[Sprint 292] Autonome Entwicklung",
      body: `
      ## Akzeptanzkriterien
      - [x] Kriterium 1 erledigt
      - [ ] Kriterium 2 offen
      `,
      state: "open",
      labels: [{ name: "sprint-goal" }],
    };

    const parsed = parseSprintIssue(rawIssue);

    expect(parsed.sprintNumber).toBe(292);
    expect(parsed.issueNumber).toBe(42);
    expect(parsed.totalCriteriaCount).toBe(2);
    expect(parsed.completedCriteriaCount).toBe(1);
    expect(parsed.progressPercent).toBe(50);
    expect(parsed.isComplete).toBe(false);
  });

  it("ermittelt korrekte Sync-Aktionen (create bei neuem Sprint, close bei erledigtem Sprint)", () => {
    // Case 1: Neuer Sprint -> create
    const actionCreate = determineSprintIssueSyncAction(sampleSprint, []);
    expect(actionCreate.action).toBe("create");
    expect(actionCreate.payload?.title).toContain("[Sprint 292]");

    // Case 2: Erledigter Sprint mit offenem Issue -> close
    const completedSprint = { ...sampleSprint, status: "ERLEDIGT" as const };
    const existingOpenIssue = {
      number: 99,
      title: "[Sprint 292] Autonome Entwicklung",
      state: "open",
    };
    const actionClose = determineSprintIssueSyncAction(completedSprint, [existingOpenIssue]);
    expect(actionClose.action).toBe("close");
    expect(actionClose.issueNumberToClose).toBe(99);
  });

  it("formatiert den Sprint-Issue-Bericht sauber", () => {
    const parsed = parseSprintIssue({
      number: 10,
      title: "[Sprint 292] Test Issue",
      body: "- [x] Done",
      state: "closed",
    });

    const report = formatSprintIssueReport(parsed);
    expect(report).toContain("✅ **Sprint-Issue 292** (#10)");
    expect(report).toContain("Status: CLOSED");
  });
});

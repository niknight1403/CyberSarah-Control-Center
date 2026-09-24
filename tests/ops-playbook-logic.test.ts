import { describe, it, expect } from "vitest";
import {
  getPresetPlaybooks,
  createPlaybookRun,
  toggleStepCompletion,
  addLogEntry,
  calculatePlaybookProgress,
  finalizePlaybookRun,
} from "../lib/ops-playbook-logic";

describe("Sprint 355 - Ops-Playbook-Screen Logic", () => {
  it("provides preset playbooks for standard incident scenarios", () => {
    const playbooks = getPresetPlaybooks();
    expect(playbooks.length).toBeGreaterThanOrEqual(3);
    expect(playbooks.some((p) => p.category === "database")).toBe(true);
    expect(playbooks.some((p) => p.category === "security")).toBe(true);
  });

  it("creates a new playbook run with step states and initial logs", () => {
    const playbook = getPresetPlaybooks()[0];
    const run = createPlaybookRun(playbook, "admin-user-1");

    expect(run.playbookId).toBe(playbook.id);
    expect(run.status).toBe("in_progress");
    expect(run.executorUserId).toBe("admin-user-1");
    expect(Object.keys(run.stepStates).length).toBe(playbook.steps.length);
    expect(run.executionLogs.length).toBe(1);
  });

  it("toggles step completion and updates progress correctly", () => {
    const playbook = getPresetPlaybooks()[0];
    let run = createPlaybookRun(playbook, "admin-user-1");

    let progress = calculatePlaybookProgress(run, playbook);
    expect(progress.completedCount).toBe(0);
    expect(progress.percentage).toBe(0);
    expect(progress.isFullyComplete).toBe(false);

    const firstStepId = playbook.steps[0].id;
    run = toggleStepCompletion(run, firstStepId, "admin-user-1", "Aktivität bestätigt", true);

    expect(run.stepStates[firstStepId].completed).toBe(true);
    expect(run.stepStates[firstStepId].notes).toBe("Aktivität bestätigt");
    expect(run.stepStates[firstStepId].verificationPassed).toBe(true);

    progress = calculatePlaybookProgress(run, playbook);
    expect(progress.completedCount).toBe(1);
    expect(progress.percentage).toBeGreaterThan(0);
  });

  it("adds custom log entries and finalizes playbook run", () => {
    const playbook = getPresetPlaybooks()[0];
    let run = createPlaybookRun(playbook, "admin-user-1");

    run = addLogEntry(run, "Manuelle Prüfung durchgeführt", "admin-user-1", "info");
    expect(run.executionLogs.some((l) => l.message.includes("Manuelle Prüfung"))).toBe(true);

    // Complete all steps
    for (const step of playbook.steps) {
      run = toggleStepCompletion(run, step.id, "admin-user-1", "Done", true);
    }

    const progress = calculatePlaybookProgress(run, playbook);
    expect(progress.isFullyComplete).toBe(true);

    run = finalizePlaybookRun(run, "completed", "admin-user-1");
    expect(run.status).toBe("completed");
    expect(run.completedAt).toBeDefined();
  });
});

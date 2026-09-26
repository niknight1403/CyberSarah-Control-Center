import { describe, expect, it } from "vitest";
import {
  calculateProgressSummary,
  createProgressTracker,
  updateStepProgress,
} from "../lib/agent-progress-report-logic";

describe("Sprint 369 — Agent Progress Report Logic", () => {
  const steps = [
    { id: "step-1", name: "Analyse der Quelldateien" },
    { id: "step-2", name: "Transformation der Daten" },
    { id: "step-3", name: "Validierung der Ergebnisse" },
  ];

  it("erstellt einen neuen ProgressTracker mit 0% Fortschritt", () => {
    const tracker = createProgressTracker("task-101", "Daten-Pipeline", steps);
    const summary = calculateProgressSummary(tracker);

    expect(summary.taskId).toBe("task-101");
    expect(summary.percentComplete).toBe(0);
    expect(summary.completedStepsCount).toBe(0);
    expect(summary.totalStepsCount).toBe(3);
    expect(summary.status).toBe("running");
    expect(summary.estimatedRemainingMs).toBeNull(); // Keine abgeschlossenen Schritte = Restzeit ehrlich null
  });

  it("aktualisiert den Fortschritt korrekt bei Schrittabschluss und berechnet Restzeit", () => {
    const startTime = 1000;
    let tracker = createProgressTracker("task-101", "Daten-Pipeline", steps, { now: startTime });

    // Schritt 1 starten
    tracker = updateStepProgress(tracker, "step-1", "in_progress", undefined, startTime + 100);

    // Schritt 1 abschließen nach 10 Sekunden
    tracker = updateStepProgress(tracker, "step-1", "completed", "100 Datensätze analysiert", startTime + 10100);

    const summary = calculateProgressSummary(tracker, startTime + 10100);

    expect(summary.percentComplete).toBe(33);
    expect(summary.completedStepsCount).toBe(1);
    expect(summary.estimatedRemainingMs).toBe(20000); // 2 verbleibende Schritte * 10s = 20s
    expect(summary.formattedReport).toContain("33% (1/3 Schritte)");
  });

  it("erkennt gestockte Aufgaben (stalled) bei Überschreitung des Inaktivitäts-Schwellenwerts", () => {
    const startTime = 1000;
    const stallThresholdMs = 5000; // 5 Sekunden
    const tracker = createProgressTracker("task-102", "Export", steps, {
      stallThresholdMs,
      now: startTime,
    });

    // Keine Aktivität seit 10 Sekunden
    const summary = calculateProgressSummary(tracker, startTime + 11000);

    expect(summary.status).toBe("stalled");
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(summary.warnings[0]).toContain("keine Aktivität");
    expect(summary.formattedReport).toContain("Gestockt (Inaktiv)");
  });

  it("markiert Tracker als failed, wenn ein Schritt fehlschlägt", () => {
    let tracker = createProgressTracker("task-103", "Build-Prozess", steps);
    tracker = updateStepProgress(tracker, "step-1", "completed");
    tracker = updateStepProgress(tracker, "step-2", "failed", "Syntaxfehler in Modul B");

    const summary = calculateProgressSummary(tracker);

    expect(summary.status).toBe("failed");
    expect(summary.failedStepsCount).toBe(1);
    expect(summary.warnings).toContain("1 Schritt(e) fehlgeschlagen.");
  });

  it("wirft einen Fehler, wenn eine ungültige stepId übergeben wird", () => {
    const tracker = createProgressTracker("task-104", "Test", steps);
    expect(() => updateStepProgress(tracker, "non-existing", "completed")).toThrow(
      "Schritt mit ID 'non-existing' existiert nicht"
    );
  });
});

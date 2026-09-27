/**
 * Sprint 369 — Fortschritts-Berichte: Agent meldet Zustand langer Aufgaben
 *
 * Verfolgt den Fortschritt mehrstufiger oder langlaufender Agenten-Aufgaben.
 * Berechnet Erfüllungsgrade, verbleibende Restzeiten und erkennt gestockte
 * Aufgaben ("stalled") anhand von Inaktivitäts-Schwellenwerten.
 */

export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export type ProgressCheckpoint = {
  stepId: string;
  stepName: string;
  status: StepStatus;
  startTime?: number;
  completedAt?: number;
  durationMs?: number;
  detail?: string;
};

export type ProgressTracker = {
  taskId: string;
  taskTitle: string;
  totalSteps: number;
  checkpoints: Map<string, ProgressCheckpoint>;
  createdAt: number;
  lastUpdatedAt: number;
  stallThresholdMs: number;
  status: "running" | "stalled" | "completed" | "failed";
};

export type ProgressSummary = {
  taskId: string;
  taskTitle: string;
  status: "running" | "stalled" | "completed" | "failed";
  percentComplete: number;
  completedStepsCount: number;
  failedStepsCount: number;
  totalStepsCount: number;
  elapsedTimeMs: number;
  estimatedRemainingMs: number | null;
  currentStepName?: string;
  warnings: string[];
  formattedReport: string;
};

/**
 * Erstellt einen neuen ProgressTracker für eine Aufgabe.
 */
export function createProgressTracker(
  taskId: string,
  taskTitle: string,
  stepDefinitions: { id: string; name: string }[],
  options?: { stallThresholdMs?: number; now?: number }
): ProgressTracker {
  const now = options?.now ?? Date.now();
  const checkpoints = new Map<string, ProgressCheckpoint>();

  for (const step of stepDefinitions) {
    checkpoints.set(step.id, {
      stepId: step.id,
      stepName: step.name,
      status: "pending",
    });
  }

  return {
    taskId,
    taskTitle,
    totalSteps: stepDefinitions.length,
    checkpoints,
    createdAt: now,
    lastUpdatedAt: now,
    stallThresholdMs: options?.stallThresholdMs ?? 30000, // Standard: 30 Sekunden
    status: "running",
  };
}

/**
 * Aktualisiert den Status eines einzelnen Schritts im ProgressTracker.
 */
export function updateStepProgress(
  tracker: ProgressTracker,
  stepId: string,
  status: StepStatus,
  detail?: string,
  now?: number
): ProgressTracker {
  const currentTime = now ?? Date.now();
  const existing = tracker.checkpoints.get(stepId);

  if (!existing) {
    throw new Error(`Schritt mit ID '${stepId}' existiert nicht im Tracker.`);
  }

  const updatedCheckpoint: ProgressCheckpoint = {
    ...existing,
    status,
    detail: detail ?? existing.detail,
  };

  if (status === "in_progress" && !updatedCheckpoint.startTime) {
    updatedCheckpoint.startTime = currentTime;
  }

  if (status === "completed" || status === "failed" || status === "skipped") {
    updatedCheckpoint.completedAt = currentTime;
    if (updatedCheckpoint.startTime) {
      updatedCheckpoint.durationMs = currentTime - updatedCheckpoint.startTime;
    } else {
      updatedCheckpoint.durationMs = 0;
    }
  }

  const newCheckpoints = new Map(tracker.checkpoints);
  newCheckpoints.set(stepId, updatedCheckpoint);

  // Ermittle Gesamtstatus des Trackers
  const allSteps = Array.from(newCheckpoints.values());
  const completedCount = allSteps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const failedCount = allSteps.filter((s) => s.status === "failed").length;

  let overallStatus: "running" | "stalled" | "completed" | "failed" = "running";
  if (failedCount > 0) {
    overallStatus = "failed";
  } else if (completedCount === tracker.totalSteps && tracker.totalSteps > 0) {
    overallStatus = "completed";
  }

  return {
    ...tracker,
    checkpoints: newCheckpoints,
    lastUpdatedAt: currentTime,
    status: overallStatus,
  };
}

/**
 * Generiert eine ehrliche Fortschrittszusammenfassung inklusive Zeitschätzung und Warnungen.
 */
export function calculateProgressSummary(
  tracker: ProgressTracker,
  now?: number
): ProgressSummary {
  const currentTime = now ?? Date.now();
  const allSteps = Array.from(tracker.checkpoints.values());
  const completedSteps = allSteps.filter((s) => s.status === "completed" || s.status === "skipped");
  const failedSteps = allSteps.filter((s) => s.status === "failed");
  const inProgressStep = allSteps.find((s) => s.status === "in_progress");

  const completedCount = completedSteps.length;
  const failedCount = failedSteps.length;
  const totalSteps = tracker.totalSteps;

  const percentComplete =
    totalSteps > 0 ? Math.min(100, Math.round((completedCount / totalSteps) * 100)) : 0;

  const elapsedTimeMs = Math.max(0, currentTime - tracker.createdAt);
  const timeSinceLastUpdate = Math.max(0, currentTime - tracker.lastUpdatedAt);

  // Stalled-Prüfung: Wenn in_progress/running und seit stallThresholdMs keine Aktualisierung erfolgte
  const warnings: string[] = [];
  let status = tracker.status;

  if (
    status === "running" &&
    timeSinceLastUpdate > tracker.stallThresholdMs &&
    completedCount < totalSteps
  ) {
    status = "stalled";
    warnings.push(
      `Aufgabe zeigt seit ${Math.round(timeSinceLastUpdate / 1000)}s keine Aktivität (Schwellenwert: ${Math.round(tracker.stallThresholdMs / 1000)}s).`
    );
  }

  if (failedCount > 0) {
    warnings.push(`${failedCount} Schritt(e) fehlgeschlagen.`);
  }

  // Zeitschätzung basierend auf bisheriger Durchschnittsdauer
  let estimatedRemainingMs: number | null = null;
  const stepsWithDuration = completedSteps.filter((s) => (s.durationMs ?? 0) > 0);

  if (stepsWithDuration.length > 0 && completedCount < totalSteps) {
    const totalDurationOfCompleted = stepsWithDuration.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const avgDurationPerStep = totalDurationOfCompleted / stepsWithDuration.length;
    const remainingSteps = totalSteps - completedCount;
    estimatedRemainingMs = Math.round(avgDurationPerStep * remainingSteps);
  }

  // Report-Text
  const currentStepName = inProgressStep?.stepName;
  const statusLabel =
    status === "completed"
      ? "Abgeschlossen"
      : status === "failed"
      ? "Fehlgeschlagen"
      : status === "stalled"
      ? "Gestockt (Inaktiv)"
      : "In Bearbeitung";

  const timeStr = estimatedRemainingMs !== null
    ? `~${Math.round(estimatedRemainingMs / 1000)}s verbleibend`
    : "Restzeit unbekannt";

  const formattedReport = [
    `[Fortschritts-Bericht] ${tracker.taskTitle} (${tracker.taskId})`,
    `Zustand: ${statusLabel} | ${percentComplete}% (${completedCount}/${totalSteps} Schritte)`,
    currentStepName ? `Aktueller Schritt: ${currentStepName}` : null,
    `Laufzeit: ${Math.round(elapsedTimeMs / 1000)}s | ${timeStr}`,
    warnings.length > 0 ? `Warnungen:\n${warnings.map((w) => ` - ${w}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    taskId: tracker.taskId,
    taskTitle: tracker.taskTitle,
    status,
    percentComplete,
    completedStepsCount: completedCount,
    failedStepsCount: failedCount,
    totalStepsCount: totalSteps,
    elapsedTimeMs,
    estimatedRemainingMs,
    currentStepName,
    warnings,
    formattedReport,
  };
}

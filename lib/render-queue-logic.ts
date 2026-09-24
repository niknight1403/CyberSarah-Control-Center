/**
 * Sprint 306 — Medien-Studio: reine, deterministische Logik fuer eine
 * Render-Warteschlange mit ehrlichem Fortschritt.
 *
 * Datenfluss:
 *   Jobs werden mit Prioritaet eingereiht; die Logik berechnet Position,
 *   Fortschritt (nur aus abgeschlossenen Szenen — KEINE animierte
 *   Fake-Progressbar) und ETA aus GEMESSENEN Durchschnittswerten.
 *
 * Ehrlichkeits-Grenze: Ohne Messwerte bleibt die ETA unbekannt und wird
 *   als solche gemeldet — nie schaetzen, um beschaeftigt zu wirken.
 */

export type RenderJobState =
  | "queued"
  | "rendering"
  | "done"
  | "failed";

export type RenderJob = {
  id: string;
  projectId: string;
  totalScenes: number;
  completedScenes: number;
  state: RenderJobState;
  priority: number; // hoeher = frueher
  enqueuedAt: number;
};

export type RenderQueue = {
  jobs: RenderJob[];
};

export const MAX_ACTIVE_RENDERS = 2;

/** Reiht einen Job ein; hoehere Prioritaet vor niedrigerer, FIFO bei Gleichstand. */
export function enqueueJob(queue: RenderQueue, job: RenderJob): RenderQueue {
  const jobs = [...queue.jobs, job].sort((a, b) =>
    b.priority - a.priority || a.enqueuedAt - b.enqueuedAt,
  );
  return { jobs };
}

/** Warteschlangen-Position (1-basiert) eines wartenden Jobs. */
export function queuePosition(queue: RenderQueue, jobId: string): number {
  const waiting = queue.jobs.filter((j) => j.state === "queued");
  const idx = waiting.findIndex((j) => j.id === jobId);
  return idx >= 0 ? idx + 1 : 0;
}

/** Naechste zu startende Jobs, wenn Slots frei sind (ehrlich gedeckelt). */
export function jobsToStart(queue: RenderQueue): RenderJob[] {
  const active = queue.jobs.filter((j) => j.state === "rendering").length;
  const free = Math.max(0, MAX_ACTIVE_RENDERS - active);
  return queue.jobs
    .filter((j) => j.state === "queued")
    .slice(0, free);
}

/** Ehrlicher Fortschritt 0..1 NUR aus abgeschlossenen Szenen. */
export function honestProgress(job: RenderJob): number {
  if (job.totalScenes <= 0) return 0;
  return Math.min(1, Math.max(0, job.completedScenes / job.totalScenes));
}

/** ETA in Sekunden aus gemessener Szenen-Dauer; null ohne Messung. */
export function estimateEtaSeconds(
  job: RenderJob,
  measuredSecondsPerScene: number | null,
): number | null {
  if (measuredSecondsPerScene === null || measuredSecondsPerScene <= 0) {
    return null;
  }
  const remaining = Math.max(0, job.totalScenes - job.completedScenes);
  return Math.round(remaining * measuredSecondsPerScene);
}

/** Fortschritts-Zeile fuer die UI, ohne Fake-Prozente. */
export function formatProgressLine(
  job: RenderJob,
  measuredSecondsPerScene: number | null,
): string {
  const pct = Math.round(honestProgress(job) * 100);
  const eta = estimateEtaSeconds(job, measuredSecondsPerScene);
  const etaText =
    eta === null ? "ETA unbekannt (noch keine Messwerte)" : `ETA ~${eta}s`;
  return `Szene ${job.completedScenes}/${job.totalScenes} (${pct} %) — ${etaText}`;
}

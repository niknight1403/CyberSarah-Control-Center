/**
 * Sprint 311 — Medien-Studio Batch-Export: reine, deterministische Logik
 * fuer den Export mehrerer Projekte mit Fehlerfortsetzung.
 *
 * Datenfluss:
 *   Ein Batch enthaelt Projekte als Items; jedes Item erhaelt ein Ergebnis.
 *   Fehler STOPPEN den Batch nicht — er laeuft weiter und sammelt
 *   Fehler ehrlich ein, bis am Ende ein Gesamtbild steht.
 *
 * Ehrlichkeits-Grenze: "partial" ist ein Ergebnis, kein Erfolg. Die
 *   Zusammenfassung nennt jede fehlgeschlagene Projekt-Id beim Namen.
 */

export type BatchItemState = "pending" | "exported" | "failed";

export type BatchItem = {
  projectId: string;
  state: BatchItemState;
  errorReason?: string;
};

export type BatchExportState = "queued" | "running" | "done" | "partial" | "failed";

export type BatchExport = {
  id: string;
  state: BatchExportState;
  items: BatchItem[];
  startedAt: number | null;
  finishedAt: number | null;
};

/** Neuer Batch aus Projekt-Ids (alle pending, ggf. dedupliziert). */
export function createBatch(id: string, projectIds: string[]): BatchExport {
  const unique = [...new Set(projectIds)];
  return {
    id,
    state: unique.length > 0 ? "running" : "done",
    items: unique.map((projectId) => ({ projectId, state: "pending" as const })),
    startedAt: unique.length > 0 ? 1 : null,
    finishedAt: null,
  };
}

/** Naechstes offenes Projekt oder null (rein berechnet). */
export function nextPendingProject(batch: BatchExport): string | null {
  return batch.items.find((i) => i.state === "pending")?.projectId ?? null;
}

/** Einzel-Ergebnis verbuchen — ohne die restlichen Items zu beruehren. */
export function recordItemResult(
  batch: BatchExport,
  projectId: string,
  outcome: { ok: true } | { ok: false; reason: string },
  now: number,
): BatchExport {
  const items = batch.items.map((item) => {
    if (item.projectId !== projectId || item.state !== "pending") return item;
    return outcome.ok
      ? { projectId, state: "exported" as const }
      : { projectId, state: "failed" as const, errorReason: outcome.reason };
  });
  const finished = !items.some((i) => i.state === "pending");
  return {
    ...batch,
    items,
    finishedAt: finished ? now : batch.finishedAt,
  };
}

export type BatchSummary = {
  state: BatchExportState;
  exported: string[];
  failed: Array<{ projectId: string; reason: string }>;
  report: string;
};

/** Ehrliches Gesamtbild: done (alle), partial (Mischung), failed (alle). */
export function summarizeBatch(batch: BatchExport): BatchSummary {
  const exported = batch.items.filter((i) => i.state === "exported");
  const failed = batch.items.filter((i) => i.state === "failed");
  const pending = batch.items.some((i) => i.state === "pending");

  let state: BatchExportState = batch.state;
  if (!pending && batch.items.length > 0) {
    if (failed.length === 0) state = "done";
    else if (exported.length === 0) state = "failed";
    else state = "partial";
  }

  const report =
    failed.length === 0
      ? `${exported.length} Projekt(e) exportiert.`
      : `${exported.length} exportiert, ${failed.length} fehlgeschlagen (${failed
          .map((f) => f.projectId)
          .join(", ")}) — Fehler werden nicht als Erfolg gezählt.`;

  return {
    state,
    exported: exported.map((i) => i.projectId),
    failed: failed.map((i) => ({ projectId: i.projectId, reason: i.errorReason ?? "unbekannt" })),
    report,
  };
}

/** Fehlgeschlagene Items fuer einen erneuten Lauf zuruecksetzen. */
export function resetFailedForRetry(batch: BatchExport): BatchExport {
  return {
    ...batch,
    state: "running",
    finishedAt: null,
    items: batch.items.map((i) =>
      i.state === "failed" ? { projectId: i.projectId, state: "pending" as const } : i,
    ),
  };
}

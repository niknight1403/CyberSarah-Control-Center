/**
 * Sprint 312 — Ergebnis-Verlauf: reine, deterministische Logik fuer den
 * Verlauf gerenderter Medien pro Nutzer mit ehrlichem Status.
 *
 * Datenfluss:
 *   Render-Ergebnisse (Video/Audio/Bild) werden je Nutzer als Eintraege
 *   gefuehrt; Status-Wechsel und Groesse sind rein berechnet, Filter und
 *   Pagination ebenfalls.
 *
 * Ehrlichkeits-Grenze: Solange geraendert wird, ist die Groesse UNBEKANNT
 *   (null) und wird als "unbekannt" angezeigt — niemals 0 MB gelogen.
 */

import type { MediaCacheKind } from "./media-cache-cleanup-logic";

export type MediaHistoryState = "rendering" | "done" | "failed";

export type MediaHistoryEntry = {
  id: string;
  userId: string;
  projectId: string;
  kind: MediaCacheKind;
  title: string;
  state: MediaHistoryState;
  createdAt: number;
  /** Byte-Groesse; null = noch nicht fertig (ehrlich unbekannt). */
  sizeBytes: number | null;
  errorReason?: string;
};

/** Neuer Verlaufseintrag beim Start eines Renders (Groese bewusst null). */
export function startEntry(
  id: string,
  userId: string,
  projectId: string,
  kind: MediaCacheKind,
  title: string,
  createdAt: number,
): MediaHistoryEntry {
  return { id, userId, projectId, kind, title, state: "rendering", createdAt, sizeBytes: null };
}

/** Erfolgreicher Abschluss: nur hier bekommt der Eintrag eine Groesse. */
export function recordSuccess(entry: MediaHistoryEntry, sizeBytes: number): MediaHistoryEntry {
  if (entry.state !== "rendering") return entry;
  return { ...entry, state: "done", sizeBytes: Math.max(0, sizeBytes) };
}

/** Fehlgeschlagener Abschluss mit Grund (bleibt im Verlauf sichtbar). */
export function recordFailure(entry: MediaHistoryEntry, reason: string): MediaHistoryEntry {
  if (entry.state !== "rendering") return entry;
  return { ...entry, state: "failed", errorReason: reason };
}

export type HistoryFilter = {
  userId: string;
  state?: MediaHistoryState;
  kind?: MediaCacheKind;
};

/** Nutzer-Filter (Pflicht) plus optionale Status-/Art-Filter, neueste zuerst. */
export function filterHistory(
  entries: MediaHistoryEntry[],
  filter: HistoryFilter,
): MediaHistoryEntry[] {
  return entries
    .filter((e) => e.userId === filter.userId)
    .filter((e) => (filter.state ? e.state === filter.state : true))
    .filter((e) => (filter.kind ? e.kind === filter.kind : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Seitenansicht: page ist 0-basiert. */
export function paginateHistory(
  entries: MediaHistoryEntry[],
  page: number,
  pageSize: number,
): { items: MediaHistoryEntry[]; page: number; totalPages: number; hasMore: boolean } {
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(entries.length / safeSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const items = entries.slice(safePage * safeSize, (safePage + 1) * safeSize);
  return {
    items,
    page: safePage,
    totalPages,
    hasMore: safePage + 1 < totalPages,
  };
}

/** Ehrliche Groeszen-Angabe: unbekannt bleibt unbekannt. */
export function formatSizeLabel(entry: MediaHistoryEntry): string {
  if (entry.sizeBytes === null) {
    return entry.state === "rendering" ? "Größe unbekannt (rendert)" : "Größe unbekannt";
  }
  const mb = entry.sizeBytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(entry.sizeBytes / 1024)} KB`;
}

/** Statuszeile fuer die UI mit Grund bei Fehlern. */
export function formatStateLine(entry: MediaHistoryEntry): string {
  if (entry.state === "failed") {
    return `Fehlgeschlagen — ${entry.errorReason ?? "unbekannter Fehler"}`;
  }
  if (entry.state === "rendering") return "Rendert …";
  return `Fertig — ${formatSizeLabel(entry)}`;
}

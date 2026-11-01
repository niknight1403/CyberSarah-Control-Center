/**
 * VillaForge-Flottenlogik (Sprint 110 — Integration VillaForge → CyberSarah
 * Control Center, 2026-10-22).
 *
 * Reine Logik zur Normalisierung und Verdichtung der öffentlichen
 * Flotten-Brücke des VillaForge-Hubs (/api/public/fleet): Status-Zählung,
 * Slot-Auslastung, Score-Aggregate und Frische-Bewertung des Snapshots.
 * Der Router (server/villaforge-router.ts) holt die Daten, dieses Modul
 * macht sie auswertbar — dadurch zu 100% ohne Netz testbar.
 */

export interface VillaForgeVillaCount {
  status: string;
  c: number;
}

export interface VillaForgeVillaScore {
  villaId: number;
  name: string | null;
  score: number;
  doneLastHour: number;
  open: number;
  avgTaskScore: number;
}

export interface VillaForgeFleetSnapshot {
  villas: VillaForgeVillaCount[];
  scheduler: { slots: number; active: number[]; queued: number };
  scores: VillaForgeVillaScore[];
  scoredTasks: { c: number; avg: number | null };
  localFirst: { localSharePct: number };
  messenger: { enabled: boolean; allowedChats: number; running: boolean };
  ts: number;
}

export interface VillaForgeFleetSummary {
  running: number;
  paused: number;
  total: number;
  slotsActive: number;
  slotsTotal: number;
  queued: number;
  avgTaskScore: number | null;
  scoredTasks: number;
  localSharePct: number;
  topVilla: { villaId: number; score: number; name: string | null } | null;
  messengerEnabled: boolean;
  fresh: boolean;
  fleetHealthy: boolean;
}

/** Millisekunden, innerhalb derer ein Flotten-Snapshot als aktuell gilt. */
export const FLEET_STALE_MS = 10 * 60 * 1000;

/** Zählt Villen nach Status; unbekannte Status landen in total, nicht in running/paused. */
export function countVillasByStatus(villas: VillaForgeVillaCount[]): { running: number; paused: number; total: number } {
  let running = 0;
  let paused = 0;
  for (const v of Array.isArray(villas) ? villas : []) {
    if (v.status === "RUNNING") running += v.c ?? 0;
    if (v.status === "PAUSED") paused += v.c ?? 0;
  }
  const total = (Array.isArray(villas) ? villas : []).reduce((sum, v) => sum + (v.c ?? 0), 0);
  return { running, paused, total };
}

/** Ist der Snapshot noch frisch (Hub meldet sich regelmäßig)? */
export function isSnapshotFresh(snapshot: VillaForgeFleetSnapshot, now = Date.now()): boolean {
  const ts = snapshot?.ts ?? 0;
  return ts > 0 && now - ts <= FLEET_STALE_MS;
}

/** Verdichtet den Snapshot zur UI-tauglichen Zusammenfassung. */
export function summarizeFleet(snapshot: VillaForgeFleetSnapshot, now = Date.now()): VillaForgeFleetSummary {
  const counts = countVillasByStatus(snapshot?.villas ?? []);
  const scheduler = snapshot?.scheduler ?? { slots: 0, active: [], queued: 0 };
  const active = Array.isArray(scheduler.active) ? scheduler.active : [];
  const scores = Array.isArray(snapshot.scores) ? snapshot.scores : [];
  const top = [...scores].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
  const avgTaskScore = snapshot?.scoredTasks?.avg ?? null;
  const localSharePct = snapshot?.localFirst?.localSharePct ?? 0;
  const fresh = isSnapshotFresh(snapshot, now);
  return {
    running: counts.running,
    paused: counts.paused,
    total: counts.total,
    slotsActive: active.length,
    slotsTotal: scheduler.slots ?? 0,
    queued: scheduler.queued ?? 0,
    avgTaskScore,
    scoredTasks: snapshot?.scoredTasks?.c ?? 0,
    localSharePct,
    topVilla: top ? { villaId: top.villaId, score: top.score ?? 0, name: top.name ?? null } : null,
    messengerEnabled: snapshot?.messenger?.enabled === true,
    fresh,
    fleetHealthy: counts.running > 0 && fresh,
  };
}

/** Einzeiler für Panels: "5/5 Slots · 5 RUNNING · Ø Task 60.6 · 49% lokal". */
export function formatFleetHeadline(summary: VillaForgeFleetSummary): string {
  const parts: string[] = [
    `${summary.slotsActive}/${summary.slotsTotal} Slots`,
    `${summary.running} RUNNING`,
    `${summary.paused} PAUSED`,
  ];
  if (summary.avgTaskScore !== null) parts.push(`Ø Task ${summary.avgTaskScore}`);
  parts.push(`${summary.localSharePct}% lokal`);
  if (!summary.fresh) parts.push("veraltet");
  return parts.join(" · ");
}

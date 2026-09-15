/**
 * Sprint 121 — Backup-Waechter: reine, deterministische Logik fuer die
 * regelmassige Backup-Pruefung (Backup-Erweiterung auf Sprint 120).
 *
 * Der Waechter vergisst nichts: jede erfolgreiche Selbstbedienungs-Aktion
 * (Manifest oder Export) wird mit Zeitstempel, Pruefsumme und Zeilenzahl
 * aufgezeichnet. Die Bewertung (rein, in dieser Datei) entscheidet:
 * - kein Eintrag -> "unbekannt" (kein Fehlalarm nach Server-Restart — der
 *   Eintrag lebt im Prozessspeicher, ehrlich dokumentiert)
 * - juenger als 22 h -> "ok"
 * - 22-26 h -> "degraded" (Warnung)
 * - aelter als 26 h -> "down" (kritisch; Stufenwechsel loest den
 *   bestehenden Sprint-110-Discord-Alarm aus)
 *
 * Die Integration laeuft ueber die Betriebswacht (ops.overview): jede
 * Auswertung bewertet den Backup-Stand neu — damit ist die "regelmassige
 * Pruefung" an jedes Dashboard-Polling gebunden, ohne eigenen Cron-Dienst.
 */

import type { BackupManifest } from "@/lib/db-backup-manifest-logic";
import type { CheckState } from "@/lib/ops-overview-logic";

/** Warnung, wenn das letzte Backup aelter als 22 h ist (Tagesrhythmus - Toleranz). */
export const BACKUP_WATCH_WARN_AFTER_MS = 22 * 60 * 60 * 1000;

/** Kritisch, wenn das letzte Backup aelter als 26 h ist (Tagesrhythmus + Toleranz). */
export const BACKUP_WATCH_CRITICAL_AFTER_MS = 26 * 60 * 60 * 1000;

export type BackupWatchSnapshot = {
  /** Epoch-ms des letzten erfolgreichen Backups (null = keins seit Serverstart). */
  lastBackupAt: number | null;
  /** Pruefsumme des letzten Manifests (Sprint 60 — Nachverfolgbarkeit). */
  lastChecksum: string | null;
  /** Zeilen des letzten Backups. */
  lastTotalRows: number | null;
};

export function emptyBackupWatchSnapshot(): BackupWatchSnapshot {
  return { lastBackupAt: null, lastChecksum: null, lastTotalRows: null };
}

/** Verzeichnet einen erfolgreichen Backup-Lauf (Manifest reicht als Wahrheit). */
export function recordBackupWatchRun(
  snapshot: BackupWatchSnapshot,
  manifest: Pick<BackupManifest, "checksum" | "totalRows">,
  nowMs: number,
): BackupWatchSnapshot {
  return {
    lastBackupAt: nowMs,
    lastChecksum: manifest.checksum,
    lastTotalRows: manifest.totalRows,
  };
}

/** Stunden-alter mit einer Nachkommastelle (fuer Details, deutsch formatiert). */
export function formatBackupAgeHours(lastBackupAt: number, nowMs: number): string {
  return ((nowMs - lastBackupAt) / 3_600_000).toFixed(1).replace(".", ",");
}

export type BackupWatchEvaluation = {
  state: CheckState;
  /** Tokenfreies, handlungsfaehiges Detail fuer die Betriebswacht-Kachel. */
  detail: string;
  /** Stunden seit dem letzten Backup (null, wenn kein Eintrag). */
  ageHours: number | null;
};

/** Bewertet den Backup-Stand rein gegen die Schwellen (22 h/26 h). */
export function evaluateBackupWatch(
  snapshot: BackupWatchSnapshot,
  nowMs: number,
): BackupWatchEvaluation {
  if (snapshot.lastBackupAt === null) {
    return {
      state: "unknown",
      detail: "Noch kein Backup seit Serverstart aufgezeichnet — einmalig Backup erstellen (Dashboard → Backup-Selbstbedienung).",
      ageHours: null,
    };
  }
  const ageMs = nowMs - snapshot.lastBackupAt;
  const ageHours = ageMs / 3_600_000;
  const ageLabel = formatBackupAgeHours(snapshot.lastBackupAt, nowMs);
  if (ageMs < BACKUP_WATCH_WARN_AFTER_MS) {
    return {
      state: "ok",
      detail: `Letztes Backup vor ${ageLabel} h (${snapshot.lastTotalRows ?? 0} Zeilen, Prüfsumme ${snapshot.lastChecksum ?? "—"}).`,
      ageHours,
    };
  }
  if (ageMs < BACKUP_WATCH_CRITICAL_AFTER_MS) {
    return {
      state: "degraded",
      detail: `Letztes Backup vor ${ageLabel} h — Tagesrhythmus läuft ab, neues Backup erstellen (Dashboard → Backup-Selbstbedienung).`,
      ageHours,
    };
  }
  return {
    state: "down",
    detail: `Letztes Backup vor ${ageLabel} h — kritisch überfällig, sofort Backup erstellen und Datenbank-Zustand prüfen.`,
    ageHours,
  };
}

/** Ops-Check-Eingabe fuer die Betriebswacht (kind "backup", Sprint 121). */
export function buildBackupWatchCheckInput(
  snapshot: BackupWatchSnapshot,
  nowMs: number,
): { kind: "backup"; state: CheckState; detail: string; ageMs: number; checkedAt: number } {
  const evaluation = evaluateBackupWatch(snapshot, nowMs);
  return {
    kind: "backup",
    state: evaluation.state,
    detail: evaluation.detail,
    ageMs: 0,
    checkedAt: nowMs,
  };
}

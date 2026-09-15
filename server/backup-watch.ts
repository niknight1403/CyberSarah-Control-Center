/**
 * Sprint 121 — Backup-Waechter: Server-Zustand (Prozessspeicher, bewusst
 * analog server/ops-alerts.ts). Nach einem Server-Restart gibt es KEINEN
 * falschen Erstalarm: ohne Eintrag meldet die Bewertung ehrlich "unbekannt"
 * statt kritisch — dauerhaft kritische Pfade deckt der externe
 * Uptime-Waechter (Sprint 92) ab.
 */
import type { BackupManifest } from "../lib/db-backup-manifest-logic";
import {
  emptyBackupWatchSnapshot,
  recordBackupWatchRun,
  type BackupWatchSnapshot,
} from "../lib/backup-watch-logic";

let snapshot: BackupWatchSnapshot = emptyBackupWatchSnapshot();

/** Verzeichnet einen erfolgreichen Backup-Lauf (Manifest genuegt). */
export function recordBackupRun(manifest: Pick<BackupManifest, "checksum" | "totalRows">): void {
  snapshot = recordBackupWatchRun(snapshot, manifest, Date.now());
}

/** Aktueller Waechter-Stand (bewusst Kopie — keine Mutation von aussen). */
export function getBackupWatchSnapshot(): BackupWatchSnapshot {
  return { ...snapshot };
}

/** Nur fuer Tests/Protokolle: Waechter gezielt zuruecksetzen. */
export function resetBackupWatchState(): void {
  snapshot = emptyBackupWatchSnapshot();
}

/**
 * Sprint 327 — Backup & Restore: reine, deterministische Logik fuer
 * die Restore-Uebung mit BEWEISBAREM Ergebnis.
 *
 * Datenfluss:
 *   Backup-Manifest (Datei, Zeitpunkt, Checksumme) und eine
 *   Restore-Uebung (Zeitpunkt, gepruefte Tabellen, Ergebnis) ergeben
 *   den Nachweis: ist die Wiederherstellung bewiesen und aktuell?
 *
 * Ehrlichkeits-Grenze: "Backup vorhanden" heisst NICHT "wieder-
 *   herstellbar". Erst eine UEBUNG mit Row-Counts und Checksummen-
 *   Abgleich beweist es — und die gilt nur begrenzte Zeit.
 */

export const RESTORE_DRILL_MAX_AGE_MS = 90 * 86_400_000; // 90 Tage

export type BackupManifest = {
  id: string;
  createdAt: number;
  checksum: string;
  tableNames: string[];
};

export type RestoreDrillResult = {
  performedAt: number;
  restoredChecksum: string | null;
  verifiedTables: string[];
  rowCountsMatched: boolean;
};

/** Pruefschritte eines Restore-Plans (feste Reihenfolge, reine Liste). */
export function buildRestorePlan(manifest: BackupManifest): string[] {
  return [
    `1. Backup ${manifest.id} von Store holen (Checksumme ${manifest.checksum}).`,
    `2. Restore in Schatten-Datenbank (NIE in Produktion ueben).`,
    `3. Checksumme des Restores mit Manifest abgleichen.`,
    `4. Row-Counts je Tabelle vergleichen: ${manifest.tableNames.join(", ")}.`,
    `5. Smoke-Test: Lesen + Schreiben auf der Schatten-DB.`,
    `6. Uebung protokollieren (Datum, Ergebnis, Abweichungen).`,
  ];
}

/** Drill auswerten: nur volle Uebereinstimmung ist ein Beweis. */
export function evaluateDrill(manifest: BackupManifest, drill: RestoreDrillResult): {
  proven: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (drill.restoredChecksum !== manifest.checksum) {
    issues.push("Checksummen-Abgleich fehlgeschlagen");
  }
  if (!drill.rowCountsMatched) {
    issues.push("Row-Counts weichen ab");
  }
  const missingTables = manifest.tableNames.filter((t) => !drill.verifiedTables.includes(t));
  if (missingTables.length > 0) {
    issues.push(`Tabellen nicht verifiziert: ${missingTables.join(", ")}`);
  }
  return { proven: issues.length === 0, issues };
}

/** Wiederherstellbarkeits-Status zum Zeitpunkt now. */
export function assessRecoverability(
  manifest: BackupManifest | null,
  lastDrill: RestoreDrillResult | null,
  now: number,
): { state: "bewiesen" | "unbewiesen" | "veraltet" | "kein-backup"; message: string } {
  if (!manifest) {
    return { state: "kein-backup", message: "Kein Backup-Manifest vorhanden." };
  }
  if (!lastDrill) {
    return {
      state: "unbewiesen",
      message: `Backup ${manifest.id} existiert, aber Wiederherstellung wurde NIE geuebt — unbewiesen.`,
    };
  }
  const { proven, issues } = evaluateDrill(manifest, lastDrill);
  if (!proven) {
    return {
      state: "unbewiesen",
      message: `Letzte Uebung unvollstaendig: ${issues.join("; ")}.`,
    };
  }
  if (now - lastDrill.performedAt > RESTORE_DRILL_MAX_AGE_MS) {
    return {
      state: "veraltet",
      message: `Beweis ist aelter als 90 Tage (Uebung vom ${new Date(lastDrill.performedAt).toISOString()}) — erneut ueben.`,
    };
  }
  return {
    state: "bewiesen",
    message: `Wiederherstellung am ${new Date(lastDrill.performedAt).toISOString()} bewiesen (Checksumme + Row-Counts).`,
  };
}

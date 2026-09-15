/**
 * Sprint 120 — Backup-Selbstbedienung: reine Logik fuer den Admin-Selbstabruf
 * vollstaendiger Datenbank-Backups (Export + Manifest in einem Schritt,
 * ohne Shell-Zugang).
 *
 * Das Backup ist ein Auditable: Das bestehende Manifest (Sprint 60,
 * lib/db-backup-manifest-logic.ts) bleibt die Checksummen-Wahrheit — der
 * Export hier packt es mit den vollstaendigen Tabellendaten in einen
 * Umschlag und validiert beides konsistent (jede Manifest-Tabelle muss
 * Daten haben, keine Tabellen mehr, keine Zeilen ohne Eintrag).
 *
 * Alles rein und deterministisch: der Router liefert Rohdaten, diese Logik
 * baut/prueft/formattiert, die UI zeigt nur.
 */

import {
  buildBackupManifest,
  manifestChecksum,
  type BackupManifest,
  type ManifestTable,
} from "@/lib/db-backup-manifest-logic";

export const BACKUP_EXPORT_FORMAT = "cybersarah-db-backup-export";
export const BACKUP_EXPORT_VERSION = 1;

/** Einzelne Tabelle darf nicht mehr Zeilen liefern (Missbrauchsschutz). */
export const BACKUP_MAX_ROWS_PER_TABLE = 50_000;

export type BackupExport = {
  format: typeof BACKUP_EXPORT_FORMAT;
  version: number;
  manifest: BackupManifest;
  /** Vollstaendige Zeilen je Tabelle (Key = Tabellenname). */
  data: Record<string, unknown[]>;
  generatedAt: string;
};

/**
 * Baut den Export-Umschlag aus Rohdaten: Manifest (Checksummen-Wahrheit)
 * plus Daten, stabile Tabellensortierung, Zeilenzahl-Grenze pro Tabelle
 * wird bewusst NICHT gekappt — ein Ueberschreiten wirft spaeter bei der
 * Validierung einen ehrlichen Fehler statt still Daten zu verlieren.
 */
export function buildBackupExport(params: {
  label: string;
  tableData: Record<string, unknown[]>;
  generatedAt: Date | string;
}): BackupExport {
  const generatedAtIso = new Date(params.generatedAt).toISOString();
  const tableCounts: Record<string, number> = {};
  for (const [tableName, rows] of Object.entries(params.tableData)) {
    tableCounts[tableName] = Array.isArray(rows) ? rows.length : 0;
  }
  const manifest = buildBackupManifest({
    label: params.label,
    tableCounts,
    generatedAt: generatedAtIso,
  });
  const data: Record<string, unknown[]> = {};
  for (const table of manifest.tables) {
    data[table.name] = Array.isArray(params.tableData[table.name]) ? params.tableData[table.name] : [];
  }
  return {
    format: BACKUP_EXPORT_FORMAT,
    version: BACKUP_EXPORT_VERSION,
    manifest,
    data,
    generatedAt: generatedAtIso,
  };
}

export type ExportValidation =
  | { valid: true; totalRows: number; tableCount: number }
  | { valid: false; reason: string };

/**
 * Prueft einen Export streng: Format/Version, Manifest-Pruefsumme (statisch
 * nachgebaut, nicht das Import-Format), Konsistenz Manifest ↔ Daten (jede
 * Tabelle vorhanden mit exakter Zeilenzahl, keine zusaetzlichen Tabellen)
 * und die Zeilen-Grenze pro Tabelle.
 */
export function validateBackupExport(
  backup: BackupExport,
  maxRowsPerTable: number = BACKUP_MAX_ROWS_PER_TABLE,
): ExportValidation {
  if (backup.format !== BACKUP_EXPORT_FORMAT || backup.version !== BACKUP_EXPORT_VERSION) {
    return { valid: false, reason: "Unbekanntes Export-Format oder -Version." };
  }
  const manifest = backup.manifest;
  if (manifest.format !== "cybersarah-db-backup-manifest" || manifest.version !== 1) {
    return { valid: false, reason: "Unbekanntes Manifest im Export." };
  }
  const expectedChecksum = manifestChecksum(manifest.tables as ManifestTable[], manifest.generatedAt);
  if (manifest.checksum !== expectedChecksum) {
    return {
      valid: false,
      reason: `Pruefsumme abweichend (erwartet ${expectedChecksum}, gefunden ${manifest.checksum}).`,
    };
  }
  const manifestTableNames = new Set(manifest.tables.map((table) => table.name));
  const dataTableNames = new Set(Object.keys(backup.data));
  for (const name of manifestTableNames) {
    if (!dataTableNames.has(name)) {
      return { valid: false, reason: `Manifest-Tabelle fehlt in den Daten: ${name}.` };
    }
    const rows = backup.data[name];
    if (!Array.isArray(rows) || rows.length !== (manifest.tables.find((table) => table.name === name)?.rowCount ?? -1)) {
      return { valid: false, reason: `Zeilenzahl abweichend fuer Tabelle ${name}.` };
    }
    if (rows.length > maxRowsPerTable) {
      return { valid: false, reason: `Tabelle ${name} ueberschreitet die Zeilen-Grenze (${rows.length}).` };
    }
  }
  for (const name of dataTableNames) {
    if (!manifestTableNames.has(name)) {
      return { valid: false, reason: `Zusaetzliche Tabelle ohne Manifest-Eintrag: ${name}.` };
    }
  }
  const totalRows = manifest.tables.reduce((sum, table) => sum + table.rowCount, 0);
  return { valid: true, totalRows, tableCount: manifest.tables.length };
}

/* ==================== Groesse & Anzeige ==================== */

/** Nettogroesse des serialisierten Exports (Bytes) — fuer die UI-Anzeige. */
export function estimateExportSizeBytes(backup: BackupExport): number {
  return JSON.stringify(backup).length;
}

/** Kompakte Groessenangabe: "812 B", "12.4 KB", "3.08 MB". */
export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type BackupSummary = {
  filename: string;
  label: string;
  tableCount: number;
  totalRows: number;
  sizeLabel: string;
  ageLabel: string;
};

/** Anzeige-Zusammenfassung (rein) — deutsch, fuer die Backup-Kachel. */
export function summarizeBackupExport(backup: BackupExport, nowMs: number): BackupSummary {
  const ageMs = Math.max(0, nowMs - Date.parse(backup.generatedAt));
  const minutes = Math.floor(ageMs / 60_000);
  const ageLabel = minutes < 1 ? "gerade erstellt" : `vor ${minutes} Min.`;
  return {
    filename: backup.manifest.filename,
    label: backup.manifest.label,
    tableCount: backup.manifest.tables.length,
    totalRows: backup.manifest.totalRows,
    sizeLabel: formatBackupSize(estimateExportSizeBytes(backup)),
    ageLabel,
  };
}

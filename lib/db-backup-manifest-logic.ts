/**
 * Sprint 60 — DB-Backup-Manifest: deterministisches Inhaltsverzeichnis
 * fuer PostgreSQL-Backups (Neon/Render-Umgebung, Hetzner-Exit Phase 3).
 *
 * Ein Backup ohne verifizierbares Manifest ist ein Blindflug: Das
 * Manifest protokolliert Tabellen, Zeilenzahlen, Zeitstempel und eine
 * deterministische Pruefsumme (FNV-1a), so dass Backups auditiert und
 * auf Vollstaendigkeit geprueft werden koennen, ohne sie einzulesen.
 * Reine Logik — die Zeilenzahlen liefert der Router aus der Datenbank.
 */

export interface ManifestTable {
  name: string;
  rowCount: number;
}

export interface BackupManifest {
  format: "cybersarah-db-backup-manifest";
  version: 1;
  label: string;
  generatedAt: string;
  totalRows: number;
  tables: ManifestTable[];
  checksum: string;
  filename: string;
}

const MAX_TABLE_NAME_LENGTH = 64;

/** Bereinigt Roh-Zeilenzahlen (Map aus Tabellennamen) in ein sortiertes Array. */
export function normalizeTableCounts(raw: Record<string, number>): ManifestTable[] {
  return Object.entries(raw)
    .filter(([name]) => String(name).trim() !== "")
    .map(([name, rowCount]) => ({
      name: String(name).trim().slice(0, MAX_TABLE_NAME_LENGTH),
      rowCount: Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** FNV-1a-Pruefsumme (32 Bit, hex) — deterministisch, abhaengig von Tabellen+Zeilen. */
export function manifestChecksum(tables: ManifestTable[], generatedAt: string): string {
  let hash = 0x811c9dc5;
  const payload = `${generatedAt}|${tables.map((t) => `${t.name}:${t.rowCount}`).join("|")}`;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Sicherer Dateiname fuer das Manifest (an chat-export-logic angelehnt). */
export function buildBackupFilename(label: string, generatedAt: Date | string): string {
  const safeLabel =
    String(label ?? "")
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "db";
  const timestamp = new Date(generatedAt).toISOString().replace(/[:.]/g, "-");
  return `db-backup-manifest-${safeLabel}-${timestamp}.json`;
}

/** Baut das Manifest mit stabiler Feldreihenfolge und Pruefsumme. */
export function buildBackupManifest({
  label,
  tableCounts,
  generatedAt,
}: {
  label: string;
  tableCounts: Record<string, number>;
  generatedAt: Date | string;
}): BackupManifest {
  const generatedAtIso = new Date(generatedAt).toISOString();
  const tables = normalizeTableCounts(tableCounts);
  const totalRows = tables.reduce((sum, table) => sum + table.rowCount, 0);
  return {
    format: "cybersarah-db-backup-manifest",
    version: 1,
    label: String(label ?? "").trim() || "production",
    generatedAt: generatedAtIso,
    totalRows,
    tables,
    checksum: manifestChecksum(tables, generatedAtIso),
    filename: buildBackupFilename(label, generatedAtIso),
  };
}

/** Prueft, ob ein Manifest plausibel und nicht veraltet ist (Default: < 25 h). */
export function validateManifest(
  manifest: BackupManifest,
  now: Date | string,
  maxAgeHours = 25,
): { valid: true } | { valid: false; reason: string } {
  if (manifest.format !== "cybersarah-db-backup-manifest" || manifest.version !== 1) {
    return { valid: false, reason: "Unbekanntes Manifest-Format." };
  }
  const expectedChecksum = manifestChecksum(
    manifest.tables,
    manifest.generatedAt,
  );
  if (manifest.checksum !== expectedChecksum) {
    return {
      valid: false,
      reason: `Pruefsumme abweichend (erwartet ${expectedChecksum}, gefunden ${manifest.checksum}).`,
    };
  }
  const ageMs =
    new Date(now).getTime() - new Date(manifest.generatedAt).getTime();
  if (ageMs > maxAgeHours * 60 * 60 * 1000) {
    return {
      valid: false,
      reason: `Manifest zu alt (${(ageMs / 3_600_000).toFixed(1)} h, erlaubt ${maxAgeHours} h).`,
    };
  }
  return { valid: true };
}

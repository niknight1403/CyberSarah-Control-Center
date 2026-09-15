/**
 * Sprint 120 — Backup-Selbstbedienung: deterministische Tests der reinen
 * Logik — Export-Umschlag (Manifest + Daten), Konsistenz-Validierung
 * (Pruefsumme, Manifest ↔ Daten, Zeilen-Grenze), Groessen-/Zusammenfassungs-
 * Formatierung.
 */
import { describe, expect, it } from "vitest";

import {
  BACKUP_EXPORT_FORMAT,
  BACKUP_EXPORT_VERSION,
  BACKUP_MAX_ROWS_PER_TABLE,
  buildBackupExport,
  estimateExportSizeBytes,
  formatBackupSize,
  summarizeBackupExport,
  validateBackupExport,
  type BackupExport,
} from "@/lib/backup-self-service-logic";

const NOW = Date.parse("2026-09-15T18:00:00.000Z");

function sampleData(): Record<string, unknown[]> {
  return {
    users: [
      { id: 1, email: "a@example.com" },
      { id: 2, email: "b@example.com" },
    ],
    orders: [{ id: 9, total: 42 }],
  };
}

describe("Sprint 120: Export-Umschlag", () => {
  it("Manifest und Daten konsistent bauen: Tabellen sortiert, Zaehlungen aus Daten", () => {
    const backup = buildBackupExport({ label: "production", tableData: sampleData(), generatedAt: new Date(NOW) });
    expect(backup.format).toBe(BACKUP_EXPORT_FORMAT);
    expect(backup.version).toBe(BACKUP_EXPORT_VERSION);
    expect(backup.manifest.totalRows).toBe(3);
    expect(backup.manifest.tables.map((t) => t.name)).toEqual(["orders", "users"]);
    expect(backup.data.users).toHaveLength(2);
    expect(backup.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("leere Datenbank liefert leeren, aber gueltigen Export", () => {
    const backup = buildBackupExport({ label: "leer", tableData: {}, generatedAt: new Date(NOW) });
    expect(backup.manifest.totalRows).toBe(0);
    expect(validateBackupExport(backup).valid).toBe(true);
  });

  it("Daten-Keys sind auf Manifest-Tabellen normalisiert (Unsortiertes wird sortiert)", () => {
    const backup = buildBackupExport({
      label: "x",
      tableData: { zebra: [{ a: 1 }], alpha: [] },
      generatedAt: new Date(NOW),
    });
    expect(Object.keys(backup.data)).toEqual(["alpha", "zebra"]);
  });
});

describe("Sprint 120: Validierung", () => {
  it("echter Roundtrip-Export besteht die strenge Validierung", () => {
    const backup = buildBackupExport({ label: "production", tableData: sampleData(), generatedAt: new Date(NOW) });
    const result = validateBackupExport(backup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.totalRows).toBe(3);
      expect(result.tableCount).toBe(2);
    }
  });

  it("falsches Format oder falsche Version wird abgelehnt", () => {
    const backup = buildBackupExport({ label: "x", tableData: {}, generatedAt: new Date(NOW) });
    expect(validateBackupExport({ ...backup, format: "andere" } as unknown as BackupExport).valid).toBe(false);
    expect(validateBackupExport({ ...backup, version: 99 } as unknown as BackupExport).valid).toBe(false);
  });

  it("manipulierte Manifest-Pruefsumme fliegt auf", () => {
    const backup = buildBackupExport({ label: "x", tableData: sampleData(), generatedAt: new Date(NOW) });
    const tampered = { ...backup, manifest: { ...backup.manifest, checksum: "deadbeef" } } as unknown as BackupExport;
    const result = validateBackupExport(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("Pruefsumme");
  });

  it("fehlende Tabelle in den Daten wird abgelehnt (Manifest ist die Wahrheit)", () => {
    const backup = buildBackupExport({ label: "x", tableData: sampleData(), generatedAt: new Date(NOW) });
    const broken = { ...backup, data: { ...backup.data, users: [] } } as unknown as BackupExport;
    const result = validateBackupExport(broken);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("Zeilenzahl");
  });

  it("zusaetzliche Tabelle ohne Manifest-Eintrag wird abgelehnt", () => {
    const backup = buildBackupExport({ label: "x", tableData: sampleData(), generatedAt: new Date(NOW) });
    const extra = { ...backup, data: { ...backup.data, geheim: [{ x: 1 }] } } as unknown as BackupExport;
    const result = validateBackupExport(extra);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("Zusaetzliche Tabelle ohne Manifest-Eintrag");
  });

  it("Zeilen-Grenze pro Tabelle wird erzwungen (Missbrauchsschutz)", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ i }));
    const backup = buildBackupExport({ label: "x", tableData: { big: rows }, generatedAt: new Date(NOW) });
    expect(validateBackupExport(backup, 4).valid).toBe(false);
    expect(validateBackupExport(backup, 5).valid).toBe(true);
    expect(BACKUP_MAX_ROWS_PER_TABLE).toBe(50_000);
  });
});

describe("Sprint 120: Groesse & Zusammenfassung", () => {
  it("Groessen-Formatierung: Bytes, KB, MB mit deutschem Dezimaltrenner", () => {
    expect(formatBackupSize(812)).toBe("812 B");
    expect(formatBackupSize(12 * 1024 + 400)).toBe("12.4 KB");
    expect(formatBackupSize(3 * 1024 * 1024 + 80 * 1024)).toBe("3.08 MB");
  });

  it("Schaetzwert wächst mit den Daten und ist deterministisch", () => {
    const small = buildBackupExport({ label: "s", tableData: { t: [{ a: 1 }] }, generatedAt: new Date(NOW) });
    const large = buildBackupExport({ label: "l", tableData: { t: Array.from({ length: 50 }, (_, i) => ({ i, text: "zeile" })) }, generatedAt: new Date(NOW) });
    expect(estimateExportSizeBytes(large)).toBeGreaterThan(estimateExportSizeBytes(small));
    expect(estimateExportSizeBytes(small)).toBe(JSON.stringify(small).length);
  });

  it("Zusammenfassung: Dateiname aus dem Manifest, Zeilen, Tabellen, Groesse, Alter", () => {
    const backup = buildBackupExport({ label: "production", tableData: sampleData(), generatedAt: new Date(NOW) });
    const summary = summarizeBackupExport(backup, NOW + 5 * 60_000);
    expect(summary.filename).toBe(backup.manifest.filename);
    expect(summary.label).toBe("production");
    expect(summary.tableCount).toBe(2);
    expect(summary.totalRows).toBe(3);
    expect(summary.sizeLabel).toMatch(/B$|KB$|MB$/);
    expect(summary.ageLabel).toBe("vor 5 Min.");
    // Sofortige Abfrage: "gerade erstellt"
    expect(summarizeBackupExport(backup, NOW).ageLabel).toBe("gerade erstellt");
  });
});

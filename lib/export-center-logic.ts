/**
 * Sprint 337 — Export-Center: reine, deterministische Logik fuer den
 * Datenexport (JSON/CSV) aller nutzer-eigenen Daten.
 *
 * Datenfluss:
 *   Nutzers Datensaetze je Entitaet werden gesammelt, gezaehlt und in
 *   JSON oder CSV serialisiert — nur EIGENE Daten, jede Entitaet
 *   landet mit Zeilenzahl im Manifest.
 *
 * Ehrlichkeits-Grenze: Leere Entitaeten bleiben im Manifest sichtbar
 *   (0 Zeilen sind Information, kein Fehler). CSV-Escaping verhindert
 *   Formel-Injektion beim Tabellenoeffnen (Zellen mit = + - @ werden
 *   entschärft).
 */

export type ExportEntity = { name: string; records: Array<Record<string, unknown>> };

export type ExportManifest = {
  exportedAt: number;
  entityCounts: Record<string, number>;
  format: "json" | "csv";
  totalRecords: number;
};

export function buildManifest(entities: ExportEntity[], format: "json" | "csv", at: number): ExportManifest {
  const entityCounts = Object.fromEntries(entities.map((e) => [e.name, e.records.length]));
  const totalRecords = entities.reduce((sum, e) => sum + e.records.length, 0);
  return { exportedAt: at, entityCounts, format, totalRecords };
}

/** JSON-Export: alles, strukturiert nach Entitaet. */
export function exportAsJson(entities: ExportEntity[]): Record<string, unknown[]> {
  return Object.fromEntries(entities.map((e) => [e.name, e.records]));
}

/** CSV-Zelle escapen + Formel-Injektion entschärfen. */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[";\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** CSV je Entitaet: Header aus der Union aller Schluessel, stabile Ordnung. */
export function exportEntityAsCsv(entity: ExportEntity): string {
  if (entity.records.length === 0) return "";
  const headers = [...new Set(entity.records.flatMap((r) => Object.keys(r)))].sort();
  const lines = [headers.join(",")];
  for (const record of entity.records) {
    lines.push(headers.map((h) => escapeCsvCell(record[h])).join(","));
  }
  return lines.join("\n");
}

/** Ehrliches Export-Paket: Dateien je Entitaet plus Manifest. */
export function buildExportPackage(
  entities: ExportEntity[],
  format: "json" | "csv",
  at: number,
): { manifest: ExportManifest; files: Array<{ filename: string; content: string }> } {
  const manifest = buildManifest(entities, format, at);
  const files =
    format === "json"
      ? [{ filename: "export.json", content: JSON.stringify(exportAsJson(entities), null, 2) }]
      : entities.map((e) => ({
          filename: `${e.name}.csv`,
          content: exportEntityAsCsv(e),
        }));
  return { manifest, files };
}

/** Nutzer-Meldung mit Zeilenzahlen je Entitaet. */
export function describeExport(manifest: ExportManifest): string {
  const perEntity = Object.entries(manifest.entityCounts)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
  return `Export (${manifest.format.toUpperCase()}) mit ${manifest.totalRecords} Datensaetzen — ${perEntity}.`;
}

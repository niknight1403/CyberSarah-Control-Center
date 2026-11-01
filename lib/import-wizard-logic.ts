/**
 * Sprint 338 — Import-Wizard: reine, deterministische Logik fuer den
 * strukturierten Import — Validierung VOR dem Schreiben.
 *
 * Datenfluss:
 *   Import-Datensaetze werden gegen das Zielschema geprueft (Pflicht-
 *   felder, Typen); nur valide Datensaetze wandern in den Schreib-Vorschlag,
 *   Fehler werden je Zeile benannt.
 *
 * Ehrlichkeits-Grenze: Es wird NIX geschrieben, bevor der Vorschlag
 *   bestaetigt ist — und ein Fehler je Zeile blockiert genau diese
 *   Zeile, nicht stillschweigend den ganzen Rest.
 */

export type FieldType = "string" | "number" | "boolean";

export type ImportSchema = Record<string, { type: FieldType; required: boolean }>;

export type ImportRow = { lineNumber: number; data: Record<string, unknown> };

export type RowIssue = { lineNumber: number; field: string; issue: "pflichtfeld fehlt" | "falscher typ" };

export type ImportPlan = {
  accepted: Array<{ lineNumber: number; data: Record<string, unknown> }>;
  rejected: Array<RowIssue & { data: Record<string, unknown> }>;
};

/** Eine Zeile pruefen (reine Funktion, Schema rein). */
export function validateRow(schema: ImportSchema, row: ImportRow): RowIssue[] {
  const issues: RowIssue[] = [];
  for (const [field, spec] of Object.entries(schema)) {
    const value = row.data[field];
    if (value === undefined || value === null || (spec.type === "string" && String(value).trim() === "")) {
      if (spec.required) issues.push({ lineNumber: row.lineNumber, field, issue: "pflichtfeld fehlt" });
      continue;
    }
    const typeOk =
      (spec.type === "string" && typeof value === "string") ||
      (spec.type === "number" && typeof value === "number") ||
      (spec.type === "boolean" && typeof value === "boolean");
    if (!typeOk) issues.push({ lineNumber: row.lineNumber, field, issue: "falscher typ" });
  }
  return issues;
}

/** Kompletten Import planen: validieren vor JEDEM Schreiben. */
export function planImport(schema: ImportSchema, rows: ImportRow[]): ImportPlan {
  const accepted: ImportPlan["accepted"] = [];
  const rejected: ImportPlan["rejected"] = [];
  for (const row of rows) {
    const issues = validateRow(schema, row);
    if (issues.length === 0) {
      accepted.push({ lineNumber: row.lineNumber, data: row.data });
    } else {
      rejected.push({ ...issues[0], data: row.data });
    }
  }
  return { accepted, rejected };
}

/** Vorschlags-Text fuer den Nutzer: was waere, ehrlich getrennt. */
export function describeImportPlan(plan: ImportPlan): string {
  const lines = [
    `Import-Vorschlag: ${plan.accepted.length} Datensaetze bereit zum Schreiben.`,
  ];
  if (plan.rejected.length > 0) {
    lines.push(`${plan.rejected.length} Datensaetze werden NICHT geschrieben:`);
    for (const r of plan.rejected) {
      lines.push(`- Zeile ${r.lineNumber}: ${r.issue} bei "${r.field}".`);
    }
  }
  return lines.join("\n");
}

/** Bestaetigung nur mit Vorschlag: keine IDs, kein Schreiben ohne Plan. */
export function canWrite(plan: ImportPlan, confirmedByUser: boolean): boolean {
  return confirmedByUser && plan.accepted.length > 0;
}

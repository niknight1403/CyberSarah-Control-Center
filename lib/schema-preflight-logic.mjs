/**
 * Deterministische Logik fuer den Produktions-Schema-Preflight
 * (scripts/production-schema-preflight.mjs).
 *
 * Hintergrund: Die Repair-Migrationen 0019/0020 werden bei jedem Deploy
 * erneut eingespielt. `CREATE INDEX IF NOT EXISTS` und
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS` verlangen in PostgreSQL aber
 * Eigentuemer-Rechte an der Tabelle — auch dann, wenn das Objekt bereits
 * existiert. Laeuft der Deploy mit einer Rolle, die die Tabellen nicht
 * besitzt (historisch gewachsene Produktions-DB), brach der Preflight mit
 * `42501 must be owner of table …` ab und blockierte damit den kompletten
 * Deploy.
 *
 * Deshalb plant diese Logik die Reparatur vorab anhand des Ist-Zustands:
 * Nur wirklich fehlende Objekte werden angefasst. So bleiben Reparaturen
 * idempotent, ohne dass ein fremder Tabellen-Eigentuemer den Deploy
 * verhindert.
 */

/**
 * Zerlegt ein Repair-SQL-Skript an den Drizzle-Statement-Markern.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitRepairStatements(sql) {
  if (typeof sql !== "string") return [];
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Klassifiziert eine einzelne Repair-Anweisung.
 * @param {string} statement
 * @returns {{kind: "table"|"index"|"column"|"unknown", object: string|null, table: string|null}}
 */
export function classifyRepairStatement(statement) {
  const sql = typeof statement === "string" ? statement.trim() : "";
  const table = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?([A-Za-z0-9_."]+)"?/i.exec(sql);
  if (table) {
    return { kind: "table", object: stripQuotes(table[1]), table: null };
  }
  const index =
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+"?([A-Za-z0-9_."]+)"?\s+ON\s+"?([A-Za-z0-9_."]+)"?/i.exec(
      sql,
    );
  if (index) {
    return { kind: "index", object: stripQuotes(index[1]), table: stripQuotes(index[2]) };
  }
  const column =
    /^ALTER\s+TABLE\s+"?([A-Za-z0-9_."]+)"?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"?([A-Za-z0-9_."]+)"?/i.exec(
      sql,
    );
  if (column) {
    return { kind: "column", object: stripQuotes(column[2]), table: stripQuotes(column[1]) };
  }
  return { kind: "unknown", object: null, table: null };
}

function stripQuotes(name) {
  return String(name ?? "")
    .replaceAll('"', "")
    .split(".")
    .pop();
}

function toNameSet(values) {
  if (values instanceof Set) return values;
  if (Array.isArray(values)) return new Set(values.map((value) => String(value)));
  return new Set();
}

/**
 * Plant die Reparatur: fuehrt nur Anweisungen aus, deren Objekt wirklich
 * fehlt. Anweisungen zu nicht vorhandenen Tabellen werden aufgeschoben
 * (frische Datenbank) statt zu scheitern.
 *
 * @param {object} input
 * @param {string[]} input.statements
 * @param {Iterable<string>|string[]} [input.existingTables]
 * @param {Iterable<string>|string[]} [input.existingIndexes]
 * @param {Record<string, Iterable<string>|string[]>} [input.existingColumns]
 * @returns {{run: string[], skipped: Array<{statement: string, kind: string, object: string|null, reason: string}>}}
 */
export function planSchemaRepair({
  statements,
  existingTables = [],
  existingIndexes = [],
  existingColumns = {},
}) {
  const tables = toNameSet(existingTables);
  const indexes = toNameSet(existingIndexes);
  const run = [];
  const skipped = [];

  for (const statement of Array.isArray(statements) ? statements : []) {
    const info = classifyRepairStatement(statement);
    if (info.kind === "table" && info.object) {
      if (tables.has(info.object)) {
        skipped.push({
          statement,
          kind: info.kind,
          object: info.object,
          reason: "Tabelle existiert bereits",
        });
        continue;
      }
      run.push(statement);
      continue;
    }
    if (info.kind === "index" && info.object) {
      if (indexes.has(info.object)) {
        skipped.push({
          statement,
          kind: info.kind,
          object: info.object,
          reason: "Index existiert bereits",
        });
        continue;
      }
      if (info.table && !tables.has(info.table)) {
        skipped.push({
          statement,
          kind: info.kind,
          object: info.object,
          reason: `Tabelle ${info.table} fehlt (aufgeschoben)`,
        });
        continue;
      }
      run.push(statement);
      continue;
    }
    if (info.kind === "column" && info.object) {
      if (info.table && !tables.has(info.table)) {
        skipped.push({
          statement,
          kind: info.kind,
          object: info.object,
          reason: `Tabelle ${info.table} fehlt (aufgeschoben)`,
        });
        continue;
      }
      const columns = toNameSet(existingColumns?.[info.table] ?? []);
      if (columns.has(info.object)) {
        skipped.push({
          statement,
          kind: info.kind,
          object: info.object,
          reason: "Spalte existiert bereits",
        });
        continue;
      }
      run.push(statement);
      continue;
    }
    // Unbekannte Anweisung: im Zweifel ausfuehren — die Repair-Skripte
    // enthalten ausschliesslich idempotente Anweisungen.
    run.push(statement);
  }

  return { run, skipped };
}

/**
 * Erkennt fehlende Eigentuemer-Rechte (PostgreSQL 42501) beim Repair.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isOwnershipError(error) {
  const e = /** @type {any} */ (error instanceof Error ? error : null);
  const cause = /** @type {any} */ (e?.cause && typeof e.cause === "object" ? e.cause : null);
  const code = String(cause?.code ?? e?.code ?? "");
  if (code === "42501") return true;
  const message = `${cause?.message ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return message.includes("must be owner of") || message.includes("permission denied for table");
}

/**
 * Bewertet das Ergebnis nach der Reparatur.
 *
 * @param {object} input
 * @param {string[]} input.requiredTables
 * @param {Iterable<string>|string[]} input.presentTables
 * @param {boolean} input.draftQueueExists
 * @param {boolean} input.dedupeKeyPresent
 * @returns {{ok: boolean, missing: string[], reasons: string[]}}
 */
export function evaluatePreflight({
  requiredTables,
  presentTables,
  draftQueueExists,
  dedupeKeyPresent,
}) {
  const present = toNameSet(presentTables);
  const required = Array.isArray(requiredTables) ? requiredTables : [];
  const missing = required.filter((name) => !present.has(name));
  const reasons = [];
  if (missing.length > 0) {
    reasons.push(`Kritische Tabellen fehlen: ${missing.join(", ")}`);
  }
  if (draftQueueExists && !dedupeKeyPresent) {
    reasons.push("draftQueue.dedupeKey fehlt (Dedupe-Reparatur nicht anwendbar)");
  }
  return { ok: reasons.length === 0, missing, reasons };
}

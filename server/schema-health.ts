/**
 * Fragt den echten Tabellenstand ab.
 *
 * Nur eine Abfrage auf information_schema, ohne Rechte auf Daten. Fehlt die
 * Datenbank, ist das Ergebnis "unbekannt" und nicht "kaputt" — der Unterschied
 * entscheidet, ob ein Deploy rot wird oder nur eine Warnung bekommt.
 */
import { sql } from "drizzle-orm";

import { CORE_TABLE_NAMES, evaluateSchemaHealth, startupVerdict, type SchemaHealth } from "../lib/schema-health-logic";
import { getDb } from "./db";

/** Tabellen, die im aktuellen Schema tatsaechlich existieren. */
export async function readPresentTables(): Promise<string[] | null> {
  const db = await getDb();
  if (!db) return null;
  const inList = CORE_TABLE_NAMES.map((name) => `'${name}'`).join(", ");
  try {
    const result = (await db.execute(
      sql.raw(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name in (${inList})`,
      ),
    )) as unknown as { rows?: { table_name: string }[] } | { table_name: string }[];
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    return rows.map((row) => row.table_name);
  } catch (error) {
    console.error(
      `[schema-health] Tabellenstand nicht lesbar: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Prueft die Kerntabellen. `null` bedeutet: nicht pruefbar (keine Datenbank).
 * Das wird bewusst nicht als "ok" ausgegeben.
 */
export async function checkCoreTables(): Promise<SchemaHealth | null> {
  const present = await readPresentTables();
  if (present === null) return null;
  return evaluateSchemaHealth(present);
}

/** Startpruefung: laut im Log, optional hart abbrechend. */
export async function assertCoreSchemaOnStartup(): Promise<void> {
  const health = await checkCoreTables();
  if (!health) {
    console.warn("[schema-health] Kein Datenbankzugriff beim Start — Kerntabellen ungeprueft.");
    return;
  }
  const strict = ["1", "true", "yes"].includes((process.env.STRICT_SCHEMA_CHECK ?? "").toLowerCase());
  const verdict = startupVerdict(health, strict);
  if (verdict.level === "ok") {
    console.info(`[schema-health] ${verdict.message}`);
    return;
  }
  console.error(`[schema-health] ${verdict.message}`);
  if (verdict.level === "fatal") {
    throw new Error(verdict.message);
  }
}

/**
 * Sprint 55 — CLI-Wrapper fuer die MySQL→PostgreSQL-Migrationsplanung.
 * Nutzung: npx tsx scripts/mysql-to-pg.ts <dump.sql> [--out migration.sql] [--report]
 * Reine Transformation auf Basis von lib/db-migration-plan-logic.ts — kein DB-Kontakt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { planMigration } from "../lib/db-migration-plan-logic";

function fail(message: string): never {
  console.error(`[mysql-to-pg] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const inputPath = args[0];
const outIndex = args.indexOf("--out");
const wantsReport = args.includes("--report");

if (!inputPath || inputPath.startsWith("--")) {
  fail("Nutzung: npx tsx scripts/mysql-to-pg.ts <dump.sql> [--out migration.sql] [--report]");
}

let dump: string;
try {
  dump = readFileSync(inputPath, "utf8");
} catch {
  fail(`Dump-Datei nicht lesbar: ${inputPath}`);
}

const plan = planMigration(dump);
const sql = [...plan.tables.map((t) => t.createStatement), ...plan.insertStatements].join("\n") + "\n";

if (outIndex !== -1 && args[outIndex + 1]) {
  writeFileSync(args[outIndex + 1], sql, "utf8");
  console.log(`[mysql-to-pg] ${plan.tables.length} DDL-Statements, ${plan.insertStatements.length} INSERT-Statements → ${args[outIndex + 1]}`);
} else {
  process.stdout.write(sql);
}

if (wantsReport) {
  console.log("--- Migrationsplan ---");
  for (const [table, count] of Object.entries(plan.expectedRowCounts)) {
    console.log(`Tabelle ${table}: ${count} Zeilen erwartet`);
  }
  for (const warning of plan.warnings) {
    console.log(`WARNUNG [${warning.table ?? "-"}]: ${warning.message}`);
  }
  if (plan.warnings.length === 0) {
    console.log("Keine Warnungen.");
  }
}

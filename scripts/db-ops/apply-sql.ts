#!/usr/bin/env node
/**
 * Wendet eine SQL-Datei aus drizzle/ direkt und idempotent an und prüft danach,
 * ob die erwarteten Tabellen existieren.
 *
 * Nötig, weil `drizzle-kit migrate` in dieser DB am Journal scheitert (siehe
 * reconcile-journal.ts). Für einzelne, idempotente Migrationen ist der direkte
 * Weg verlässlich und überprüfbar.
 *
 * Aufruf: FILE=drizzle/0027_billing_telemetry.sql TABLES=a,b npx tsx scripts/db-ops/apply-sql.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { splitSslMode, splitStatements, sslOptionsFor } from "../../lib/migration-journal-logic";


async function main(): Promise<void> {
  const file = process.env.FILE ?? "";
  const expected = (process.env.TABLES ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!file.startsWith("drizzle/") || !file.endsWith(".sql")) {
    console.error("FILE muss eine Datei unter drizzle/ sein.");
    return process.exit(2);
  }

  const parts = splitSslMode(process.env.DATABASE_URL ?? "");
  const sqlText = readFileSync(path.resolve(process.cwd(), file), "utf8");
  const statements = splitStatements(sqlText);

  console.log(
    `Datei: ${file} | Anweisungen: ${statements.length} | erwartet: ${expected.join(", ") || "keine"} | sslmode: ${parts.requestedSslMode ?? "nicht gesetzt"}${parts.relaxedVerification ? " (ohne CA-Prüfung)" : ""}`,
  );

  const client = new pg.Client({ connectionString: parts.connectionString, ssl: sslOptionsFor(parts) });
  await client.connect();
  let failed = 0;
  try {
    for (const [index, statement] of statements.entries()) {
      try {
        await client.query(statement);
        console.log(`  [${index + 1}/${statements.length}] ok`);
      } catch (error) {
        failed += 1;
        console.error(`  [${index + 1}/${statements.length}] FEHLER: ${(error as Error).message}`);
      }
    }

    for (const table of expected) {
      const exists = await client.query("select to_regclass($1) as tbl", [`public.${table}`]);
      if (!exists.rows[0]?.tbl) {
        console.error(`${table}: FEHLT`);
        failed += 1;
        continue;
      }
      const count = await client.query(`select count(*)::int as n from "${table}"`);
      console.log(`${table}: vorhanden (${count.rows[0].n} Zeilen)`);
    }
  } finally {
    await client.end();
  }

  return process.exit(failed === 0 ? 0 : 1);

}

main().catch((error) => {
  console.error("Abbruch:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Wendet eine SQL-Datei aus drizzle/ direkt an (idempotent) und prüft danach,
 * ob die erwarteten Tabellen existieren.
 *
 * Hintergrund: `drizzle-kit migrate` verlässt sich auf das Journal in
 * drizzle.__drizzle_migrations. In der Produktions-DB ist dieses Journal nicht
 * deckungsgleich mit der Repo-Historie (die Snapshot-Kette endet bei 0012, die
 * späteren Migrationen wurden von Hand geschrieben), deshalb bricht migrate mit
 * "relation already exists" ab. Für einzelne, idempotente Migrationen ist der
 * direkte Weg verlässlich und überprüfbar.
 *
 * Aufruf: FILE=drizzle/0027_billing_telemetry.sql TABLES=revenue_loop_runs,... node apply-sql.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const file = process.env.FILE ?? "";
const expected = (process.env.TABLES ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

if (!file || !file.startsWith("drizzle/") || !file.endsWith(".sql")) {
  console.error("FILE muss eine Datei unter drizzle/ sein.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL fehlt.");
  process.exit(2);
}

const sqlText = readFileSync(path.resolve(process.cwd(), file), "utf8");
const statements = sqlText
  .split("--> statement-breakpoint")
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

console.log(`Datei: ${file} | Anweisungen: ${statements.length} | erwartet: ${expected.join(", ") || "keine"}`);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
let failed = 0;
try {
  for (const [index, statement] of statements.entries()) {
    try {
      await client.query(statement);
      console.log(`  [${index + 1}/${statements.length}] ok`);
    } catch (error) {
      failed += 1;
      console.error(`  [${index + 1}/${statements.length}] FEHLER: ${error.message}`);
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

process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Stempelt die Drizzle-Migrationen als angewandt, wenn das Schema bereits
 * existiert, das Journal aber leer ist (z.B. nach einem DB-Restore).
 * Ohne diesen Schritt versucht drizzle-kit migrate alle Tabellen neu
 * anzulegen und scheitert an den vorhandenen Objekten.
 * Aufruf: node scripts/ops/stamp-migrations.mjs [--apply]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const root = path.resolve(process.cwd());
const drizzleDir = path.join(root, "drizzle");
const journalPath = path.join(drizzleDir, "meta", "_journal.json");

const envFromFile = () => {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
};

const connectionString = process.env.DATABASE_URL || envFromFile().DATABASE_URL;
if (!connectionString) {
  console.log("FEHLER: DATABASE_URL nicht verfuegbar");
  process.exit(1);
}
if (!existsSync(journalPath)) {
  console.log("FEHLER: drizzle/meta/_journal.json fehlt");
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const entries = journal.entries ?? [];
console.log(`Journal-Eintraege: ${entries.length}`);

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const tableCount = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  console.log(`Tabellen in public: ${tableCount.rows[0].count}`);
  if (tableCount.rows[0].count < 50) {
    console.log("ABBRUCH: zu wenige Tabellen, das Schema ist offenbar nicht aufgebaut");
    process.exit(2);
  }

  await client.query(`create schema if not exists drizzle`);
  await client.query(
    `create table if not exists drizzle.__drizzle_migrations (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`,
  );

  const existing = await client.query("select hash from drizzle.__drizzle_migrations");
  const known = new Set(existing.rows.map((row) => row.hash));
  console.log(`Bereits gestempelt: ${known.size}`);

  let inserted = 0;
  for (const entry of entries) {
    const sqlPath = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      console.log(`  uebersprungen (Datei fehlt): ${entry.tag}`);
      continue;
    }
    const hash = createHash("sha256").update(readFileSync(sqlPath, "utf8")).digest("hex");
    if (known.has(hash)) continue;
    if (!apply) {
      console.log(`  wuerde stempeln: ${entry.tag}`);
      inserted += 1;
      continue;
    }
    await client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
      [hash, entry.when ?? Date.now()],
    );
    inserted += 1;
  }

  console.log(`${apply ? "Gestempelt" : "Wuerde stempeln"}: ${inserted}`);
  const after = await client.query("select count(*)::int as count from drizzle.__drizzle_migrations");
  console.log(`Journal-Eintraege in der DB: ${after.rows[0].count}`);
} finally {
  await client.end();
}

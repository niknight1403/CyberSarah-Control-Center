#!/usr/bin/env node
/**
 * Trägt fehlende Migrations-Hashes in drizzle.__drizzle_migrations nach, ohne
 * eine Tabelle anzufassen.
 *
 * Warum: `drizzle-kit migrate` prüft je Datei einen SHA-256-Hash. Wurde das
 * Schema per `db:push` oder per Hand angelegt, fehlen diese Zeilen, und migrate
 * versucht alle Migrationen erneut — der Lauf bricht mit "relation already
 * exists" ab und der Deploy steht.
 *
 * Sicherheit: Es wird nur das Journal nachgetragen (Hash + Zeitstempel aus
 * drizzle/meta/_journal.json). Es wird kein SQL ausgeführt. Vorher wird geprüft,
 * dass das Schema überhaupt existiert; ohne Anwendungstabellen bricht das
 * Skript ab, statt eine leere Datenbank "fertig" zu stempeln.
 *
 * Aufruf: npx tsx scripts/db-ops/reconcile-journal.ts [--apply]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  planJournalReconciliation,
  splitSslMode,
  sslOptionsFor,
  type JournalEntry,
} from "../../lib/migration-journal-logic";

const apply = process.argv.includes("--apply");
const root = process.cwd();
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
if (!existsSync(journalPath)) {
  console.error("Journal fehlt:", journalPath);
  process.exit(2);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: JournalEntry[] };
const entries = Array.isArray(journal.entries) ? journal.entries : [];
if (entries.length === 0) {
  console.error("Journal enthält keine Einträge.");
  process.exit(2);
}

const readSql = (tag: string): string | null => {
  const file = path.join(root, "drizzle", `${tag}.sql`);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

const parts = splitSslMode(process.env.DATABASE_URL ?? "");
const client = new pg.Client({ connectionString: parts.connectionString, ssl: sslOptionsFor(parts) });
await client.connect();

try {
  // Sicherheitsnetz: ohne Schema wird nichts gestempelt.
  const schema = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
  );
  const tableCount = schema.rows[0]?.n ?? 0;
  console.log(`Öffentliche Tabellen: ${tableCount} | Journal-Einträge: ${entries.length}`);
  if (tableCount < 5) {
    console.error("Zu wenige Tabellen — sieht nach leerer Datenbank aus. Abbruch, kein Stempeln.");
    process.exit(1);
  }

  const hasJournalTable = await client.query("select to_regclass('drizzle.__drizzle_migrations') as tbl");
  if (!hasJournalTable.rows[0]?.tbl) {
    console.log("Journal-Tabelle fehlt, wird angelegt.");
    await client.query('create schema if not exists "drizzle"');
    await client.query(
      'create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)',
    );
  }

  const appliedRows = await client.query('select hash from "drizzle"."__drizzle_migrations"');
  const appliedHashes: string[] = appliedRows.rows.map((row: { hash: string }) => row.hash);
  console.log(`Bereits gestempelt: ${appliedHashes.length}`);

  const plan = planJournalReconciliation(entries, appliedHashes, readSql);
  console.log(`Bereits vorhanden: ${plan.alreadyApplied.length} | Nachzutragen: ${plan.toStamp.length}`);
  if (plan.unreadable.length > 0) console.warn(`Ohne SQL-Datei (übersprungen): ${plan.unreadable.join(", ")}`);
  for (const entry of plan.toStamp) console.log(`  + ${entry.tag}`);

  if (!apply) {
    console.log("Probelauf — mit --apply werden die Hashes geschrieben.");
  } else {
    for (const entry of plan.toStamp) {
      await client.query(
        'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)',
        [entry.hash, entry.createdAt],
      );
    }
    const after = await client.query('select count(*)::int as n from "drizzle"."__drizzle_migrations"');
    console.log(`Gestempelt. Einträge jetzt: ${after.rows[0].n}`);
  }
} finally {
  await client.end();
}

#!/usr/bin/env node
/**
 * Migrations-Register der Anwendung (public.schema_migrations).
 *
 * Warum nicht drizzle.__drizzle_migrations: In der Produktions-DB gehört das
 * Schema `drizzle` einem anderen Eigentümer, der Anwendungsnutzer hat dort
 * keine Schreibrechte ("permission denied for schema drizzle"). Damit war ein
 * sauberer Abschluss über `drizzle-kit migrate` unmöglich.
 *
 * Dieses Register liegt im public-Schema, gehört dem Anwendungsnutzer und
 * arbeitet mit denselben Dateien und Journal-Einträgen:
 *
 *   --status     nur lesen: was ist offen, welche Rechte bestehen
 *   --baseline   vorhandene Migrationen als "bereits im Schema enthalten"
 *                vermerken, OHNE SQL auszuführen (einmalig, nach Prüfung)
 *   --apply      offene Migrationen wirklich anwenden und vermerken
 *
 * Aufruf: npx tsx scripts/db-ops/migrate-runner.ts --status|--baseline|--apply
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  planPendingMigrations,
  splitSslMode,
  splitStatements,
  sslOptionsFor,
  type JournalEntry,
} from "../../lib/migration-journal-logic";

const REGISTER = "public.schema_migrations";

async function main(): Promise<void> {
  const status = process.argv.includes("--status");
  const baseline = process.argv.includes("--baseline");
  const apply = process.argv.includes("--apply");
  if (!status && !baseline && !apply) {
    console.error("Bitte --status, --baseline oder --apply angeben.");
    return process.exit(2);
  }

  const root = process.cwd();
  const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    console.error("Journal fehlt:", journalPath);
    return process.exit(2);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: JournalEntry[] };
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const readSql = (tag: string): string | null => {
    const file = path.join(root, "drizzle", `${tag}.sql`);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  };

  const parts = splitSslMode(process.env.DATABASE_URL ?? "");
  const client = new pg.Client({ connectionString: parts.connectionString, ssl: sslOptionsFor(parts) });
  await client.connect();

  try {
    // Rechte und Identität offenlegen, damit "permission denied" nicht wieder
    // als Überraschung kommt.
    const who = await client.query(
      "select current_user as usr, current_database() as db, current_schema() as schema",
    );
    const rights = await client.query(`
      select
        has_schema_privilege(current_user, 'public', 'CREATE') as can_create_public,
        has_schema_privilege(current_user, 'drizzle', 'USAGE') as can_use_drizzle,
        has_schema_privilege(current_user, 'drizzle', 'CREATE') as can_create_drizzle
    `);
    console.log(
      `Nutzer: ${who.rows[0].usr} | DB: ${who.rows[0].db} | Schema: ${who.rows[0].schema} | public CREATE: ${rights.rows[0].can_create_public} | drizzle USAGE: ${rights.rows[0].can_use_drizzle} | drizzle CREATE: ${rights.rows[0].can_create_drizzle}`,
    );

    if (rights.rows[0].can_create_public && rights.rows[0].can_create_drizzle) {
      console.log("Hinweis: Schreibrechte im drizzle-Schema vorhanden — drizzle-kit wäre möglich.");
    }

    await client.query(`
      create table if not exists ${REGISTER} (
        tag text primary key,
        hash text not null,
        mode text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = await client.query(`select tag from ${REGISTER} order by tag`);
    const appliedTags: string[] = appliedRows.rows.map((row: { tag: string }) => row.tag);

    const plan = planPendingMigrations(entries, appliedTags, readSql);
    console.log(
      `Journal: ${entries.length} Einträge | im Register: ${plan.applied.length} | offen: ${plan.pending.length}`,
    );
    if (plan.anomalies.length > 0) console.warn(`Auffälligkeiten: ${plan.anomalies.join(" | ")}`);
    if (plan.unreadable.length > 0) console.warn(`Ohne SQL-Datei: ${plan.unreadable.join(", ")}`);
    for (const entry of plan.pending) console.log(`  offen: ${entry.tag}`);

    if (status) {
      console.log(plan.pending.length === 0 ? "Status: nichts offen." : "Status: offene Migrationen vorhanden.");
      return;
    }

    if (baseline) {
      if (plan.pending.length === 0) {
        console.log("Baseline: nichts zu vermerken.");
        return;
      }
      // Kein SQL: das Schema enthält diese Migrationen bereits (per Push oder
      // Hand angelegt). Das wird als "baseline" gekennzeichnet, damit später
      // nachvollziehbar bleibt, was wirklich per Runner lief.
      for (const entry of plan.pending) {
        await client.query(
          `insert into ${REGISTER} (tag, hash, mode) values ($1, $2, 'baseline') on conflict (tag) do nothing`,
          [entry.tag, entry.hash],
        );
        console.log(`  baseline: ${entry.tag}`);
      }
      const after = await client.query(`select count(*)::int as n from ${REGISTER}`);
      console.log(`Baseline gesetzt. Einträge jetzt: ${after.rows[0].n}`);
      return;
    }

    if (plan.pending.length === 0) {
      console.log("Anwenden: nichts offen.");
      return;
    }

    let failed = 0;
    for (const entry of plan.pending) {
      const sqlText = readSql(entry.tag) as string;
      const statements = splitStatements(sqlText);
      console.log(`${entry.tag}: ${statements.length} Anweisungen`);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
          console.log(`  [${index + 1}/${statements.length}] ok`);
        } catch (error) {
          failed += 1;
          console.error(`  [${index + 1}/${statements.length}] FEHLER: ${(error as Error).message}`);
        }
      }
      if (failed === 0) {
        await client.query(
          `insert into ${REGISTER} (tag, hash, mode) values ($1, $2, 'applied') on conflict (tag) do nothing`,
          [entry.tag, entry.hash],
        );
      }
    }
    console.log(failed === 0 ? "Alle offenen Migrationen angewandt." : `Abgeschlossen mit ${failed} Fehlern.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Abbruch:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

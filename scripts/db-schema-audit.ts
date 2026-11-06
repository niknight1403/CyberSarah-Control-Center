/**
 * Schema-Audit gegen die konfigurierte DATABASE_URL.
 *
 * Ohne Argumente: pruefen und melden. Mit `--apply`: zuerst Migrationen
 * nachziehen, dann erneut pruefen.
 *
 * Warum es dieses Skript gibt: Auf Render startet nur `node dist/index.js`.
 * Niemand fuehrt dort Migrationen aus. Damit ist der Tabellenstand eine Frage
 * des Deploy-Ablaufs und nicht des Codes — genau hier wird sie beantwortet.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { CORE_TABLE_NAMES, evaluateSchemaHealth } from "../lib/schema-health-logic";

config({ quiet: true });

function mask(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return "unbekannt (URL nicht lesbar)";
  }
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("[db:audit] DATABASE_URL ist nicht gesetzt. Ohne Verbindung gibt es keinen Befund.");
    return 2;
  }
  const apply = process.argv.includes("--apply");
  console.log(`[db:audit] Ziel: ${mask(url)}${apply ? " (Migrationen werden angewandt)" : ""}`);

  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    if (apply) {
      console.log("[db:audit] Migrationen aus drizzle/ werden angewandt ...");
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      console.log("[db:audit] Migrationen abgeschlossen.");
    }

    const result = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[])`,
      [CORE_TABLE_NAMES],
    );
    const health = evaluateSchemaHealth(result.rows.map((row) => row.table_name));
    console.log(`[db:audit] ${health.summary}`);
    if (!health.ok) {
      for (const entry of health.missing) {
        console.error(`[db:audit]   fehlt: ${entry.name} — betroffen: ${entry.impact} (Migration ${entry.migration})`);
      }
      if (!apply) console.error("[db:audit] Naechster Schritt: npm run db:audit -- --apply");
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`[db:audit] Abfrage fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    return 3;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[db:audit] Unerwarteter Fehler:", error);
    process.exit(3);
  });

#!/usr/bin/env node
/**
 * Read-only Datenbankdiagnose auf dem Server.
 * Liest DATABASE_URL aus der .env, prüft Tabellen und den Readiness-Fehler.
 * Gibt niemals Zugangsdaten aus.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnv(path = ".env") {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("Warnung: .env nicht lesbar");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt");
  process.exit(1);
}

const checks = [
  ["attribution_tabelle", "select to_regclass('public.revenue_attribution_events') as t"],
  ["attribution_spalten", "select count(*)::text as n from information_schema.columns where table_name='revenue_attribution_events'"],
  ["tabellen_gesamt", "select count(*)::text as n from information_schema.tables where table_schema='public'"],
  ["migrationen", "select count(*)::text as n from information_schema.tables where table_schema='drizzle'"],
];

const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await client.connect();
  for (const [name, sql] of checks) {
    try {
      const result = await client.query(sql);
      console.log(`${name}: ${JSON.stringify(result.rows[0])}`);
    } catch (error) {
      console.log(`${name}: FEHLER ${error.message}`);
    }
  }
  // Genauer Fehler der Readiness-Abfrage, damit die Ursache sichtbar wird.
  const readinessProbe = process.env.PROBE_SQL;
  if (readinessProbe) {
    try {
      await client.query(readinessProbe);
      console.log("probe: ok");
    } catch (error) {
      console.log(`probe: FEHLER ${error.message}`);
    }
  }
} catch (error) {
  console.log(`Verbindung: FEHLER ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

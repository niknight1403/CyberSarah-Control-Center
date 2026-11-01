#!/usr/bin/env node
/**
 * Bringt das Passwort der Postgres-Rolle auf den Wert aus DATABASE_URL und
 * prueft die Verbindung danach. Gibt niemals das Passwort aus.
 * Aufruf auf dem Server: node scripts/ops/db-fix.mjs
 */
import { readFileSync, appendFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const envPath = process.env.ENVF ?? ".env";
let raw = "";
try {
  raw = readFileSync(envPath, "utf8");
} catch (error) {
  console.log(`FEHLER: ${envPath} nicht lesbar (${error.code})`);
  process.exit(1);
}

let line = raw.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL"));

// Fehlt die Zeile in der .env, kommt der Wert aus der laufenden App
// (Datei mit der URL-Zeile, per root aus /proc/<pid>/environ gezogen).
if (!line && process.env.DATABASE_URL_FILE) {
  try {
    const fromProc = readFileSync(process.env.DATABASE_URL_FILE, "utf8").trim();
    if (fromProc.startsWith("DATABASE_URL=")) {
      line = fromProc;
      appendFileSync(envPath, `\n${fromProc}\n`);
      chmodSync(envPath, 0o600);
      console.log("DATABASE_URL war in der .env nicht vorhanden und wurde aus dem App-Prozess uebernommen.");
    }
  } catch (error) {
    console.log(`Hinweis: Prozess-Env nicht lesbar (${error.code}).`);
  }
}

if (!line) {
  console.log("FEHLER: keine DATABASE_URL-Zeile gefunden.");
  const names = raw
    .split(/\r?\n/)
    .map((entry) => entry.split("=")[0])
    .filter((name) => /^[A-Z_][A-Z0-9_]*$/.test(name));
  console.log(`Vorhandene Variablen (${names.length}): ${names.slice(0, 40).join(", ")}`);
  process.exit(1);
}
console.log(`DATABASE_URL gefunden (${line.length} Zeichen, Wert nicht ausgegeben).`);

const value = line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "").trim();
let url;
try {
  url = new URL(value);
} catch {
  console.log("FEHLER: DATABASE_URL ist keine gueltige URL.");
  process.exit(1);
}
const role = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const host = url.hostname;
const port = url.port || "5432";
const database = url.pathname.replace(/^\//, "") || "postgres";
console.log(`Ziel: Rolle ${role}, Host ${host}:${port}, Datenbank ${database}, Passwort ${password.length} Zeichen.`);

if (!role || !password) {
  console.log("FEHLER: Rolle oder Passwort fehlt in der URL.");
  process.exit(1);
}

const literal = `'${password.replace(/'/g, "''")}'`;
const sql = `ALTER ROLE "${role.replace(/"/g, '""')}" WITH PASSWORD ${literal};`;
const alter = spawnSync("runuser", ["-u", "postgres", "--", "psql", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});
console.log(`ALTER ROLE exit=${alter.status}${alter.stderr ? ` stderr=${alter.stderr.trim().slice(0, 300)}` : ""}`);

const client = new Client({ connectionString: value, connectionTimeoutMillis: 8000 });
try {
  await client.connect();
  const probe = await client.query("select current_user as u, current_database() as d, now()::text as t");
  console.log(`Verbindung: ok als ${probe.rows[0].u} auf ${probe.rows[0].d}`);
  const table = await client.query("select to_regclass('public.revenue_attribution_events') as t");
  console.log(`revenue_attribution_events: ${JSON.stringify(table.rows[0])}`);
} catch (error) {
  console.log(`Verbindung: FEHLER ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

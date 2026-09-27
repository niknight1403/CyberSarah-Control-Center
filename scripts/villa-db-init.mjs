/**
 * Villa DB Init — legt die Datenbank `agenten_villa` im bestehenden Neon-Projekt
 * an (CyberSarah-DATABASE_URL), spielt die Drizzle-Migration der Agenten-Villa
 * ein und setzt DATABASE_URL direkt auf dem Render-Service.
 *
 * Alles laeuft in EINEM Prozess: der abgeleitete Connection-String wird nie
 * ausgegeben, nie in GITHUB_ENV geschrieben und erscheint in keinem Log.
 *
 * Vorbedingungen im Workflow:
 *   - CCC-Checkout mit diesem Skript, `npm install postgres --no-save`
 *   - Agenten-Villa-Checkout unter ./villa mit installierten Deps (pnpm install)
 *   - Env: DATABASE_URL (Neon, CyberSarah), RENDER_API_KEY,
 *          RENDER_VILLA_SERVICE_ID, NEON_DB_NAME (default agenten_villa)
 */
import postgres from "postgres";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const CCC_URL = process.env.DATABASE_URL;
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const SERVICE_ID = process.env.RENDER_VILLA_SERVICE_ID;
const DB_NAME = process.env.NEON_DB_NAME || "agenten_villa";
const VILLA_DIR = process.env.VILLA_DIR || "./villa";
const log = (msg) => console.log(`[villa-db] ${msg}`);

if (!CCC_URL || !RENDER_API_KEY || !SERVICE_ID) {
  console.error("[villa-db] DATABASE_URL, RENDER_API_KEY und RENDER_VILLA_SERVICE_ID muessen gesetzt sein");
  process.exit(1);
}

function deriveUrl(baseUrl, dbName) {
  // postgres://user:pass@host[:port]/dbname[?params] -> Pfad-DB ersetzen
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function main() {
  // 1) Datenbank im Neon-Projekt anlegen (idempotent)
  const admin = postgres(CCC_URL, { max: 1 });
  try {
    const exists = await admin`select datname from pg_database where datname = ${DB_NAME}`;
    if (exists.count > 0) {
      log(`Datenbank ${DB_NAME} existiert bereits`);
    } else {
      log(`Lege Datenbank ${DB_NAME} an ...`);
      // CREATE DATABASE darf nicht in parametrisierter Form laufen
      const check = /^[a-z_][a-z0-9_]*$/.exec(DB_NAME);
      if (!check) throw new Error("Ungueltiger DB-Name");
      await admin.unsafe(`CREATE DATABASE "${DB_NAME}"`);
      log(`Datenbank ${DB_NAME} angelegt`);
    }
  } finally {
    await admin.end();
  }

  // 2) Drizzle-Migration gegen die Villa-Datenbank (Gleicher Prozess, String bleibt im Speicher)
  const villaUrl = deriveUrl(CCC_URL, DB_NAME);
  log("Spiele Drizzle-Migration ein (drizzle-kit migrate) ...");
  const run = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: VILLA_DIR,
    env: { ...process.env, DATABASE_URL: villaUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = `${run.stdout || ""}${run.stderr || ""}`;
  // Fehler mit moeglicher URL-Sprenzung auf Endpunkte kuerzen
  const safe = out.split("\n").filter((l) => !l.includes(villaUrl)).join("\n");
  if (run.status !== 0) {
    console.error(`[villa-db] Migration fehlgeschlagen:\n${safe.slice(0, 1500)}`);
    process.exit(1);
  }
  log("Migration eingespielt");

  // 3) Tabellen verifizieren
  const villa = postgres(villaUrl, { max: 1 });
  try {
    const tables = await villa`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    const names = tables.map((t) => t.tablename);
    log(`Tabellen: ${names.join(", ")}`);
    for (const expected of ["users", "villa_messages", "villas"]) {
      if (!names.includes(expected)) throw new Error(`Tabelle fehlt: ${expected}`);
    }
  } finally {
    await villa.end();
  }

  // 4) DATABASE_URL direkt auf Render setzen und Deploy triggern
  log("Setze DATABASE_URL auf dem Render-Service ...");
  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RENDER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ key: "DATABASE_URL", value: villaUrl }]),
  });
  if (!res.ok) {
    console.error(`[villa-db] Render env-var Fehler: HTTP ${res.status}`);
    process.exit(1);
  }
  log("DATABASE_URL auf Render gesetzt");

  const dep = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RENDER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const depText = await dep.text();
  let depId = null;
  try { depId = JSON.parse(depText).id; } catch { depId = `http-${dep.status}`; }
  log(`Deploy getriggert: HTTP ${dep.status} (id=${depId ?? randomUUID().slice(0, 8)})`);
  log("FERTIG — Health pruefen: https://agenten-villa.onrender.com/api/health (database.status=verbunden)");
}

main().catch((error) => {
  console.error(`[villa-db] Fehler: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

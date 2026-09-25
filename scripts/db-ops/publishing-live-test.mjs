/**
 * Sprint 370 — Admin-Live-Test: X-Publishing-Job fuer den Admin einreihen
 * bzw. den Verarbeitungsstand abfragen. Laeuft auf dem GitHub-Runner gegen
 * die LIVE-Datenbank (DATABASE_URL aus Repo-Secrets).
 *
 * OP=enqueue        : Reiht EINEN faelligen X-Job fuer den Admin-Nutzer ein.
 *                     Der Live-Autopilot (60-Sekunden-Takt) uebernimmt ihn:
 *                     Token-Aufloesung (inkl. erster echter Rotation in
 *                     platform_tokens), LLM-Content, Live-Post auf X.
 * OP=status         : Zeigt die letzten Publishing-Jobs (Modus, External-ID,
 *                     Fehler) — ehrlicher Verifikations-Rueckkanal.
 *
 * Bewusst KEIN direktes Posten: die App selbst published, dieser Weg reiht
 * nur ein — genau wie die tRPC enqueueCampaign-Prozedur es tut.
 */

import { Pool } from "pg";

const OP = process.env.OP ?? "";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[db-ops] DATABASE_URL fehlt.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function adminOpenId(client) {
  const admin = await client.query("SELECT \"openId\" FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (admin.rows.length > 0) return admin.rows[0].openId;
  // Ehrlicher Fallback: einzelner Nutzer, wenn kein Admin existiert.
  const any = await client.query("SELECT \"openId\", COUNT(*) OVER() AS total FROM users ORDER BY id LIMIT 2");
  if (any.rows.length === 1) return any.rows[0].openId;
  throw new Error("Kein eindeutiger Ziel-Nutzer (Admin) gefunden — Abbruch.");
}

async function enqueue() {
  const client = await pool.connect();
  try {
    const openId = await adminOpenId(client);
    const dedupeKey = `sprint370-live-test-${new Date().toISOString().slice(0, 10)}`;
    const existing = await client.query('SELECT id FROM "publishingJobs" WHERE user_open_id = $1 AND dedupe_key = $2', [openId, dedupeKey]);
    if (existing.rows.length > 0) {
      console.log(`[db-ops] Job existiert bereits (id ${existing.rows[0].id}) — kein Duplikat eingereiht.`);
      return;
    }
    const result = await client.query(
      `INSERT INTO "publishingJobs"
         (user_open_id, product, goal, persona, platform, campaign_day, dedupe_key, status, scheduled_for)
       VALUES ($1, $2, $3, $4, 'x', 1, $5, 'geplant', now())
       RETURNING id, scheduled_for`,
      [
        openId,
        "CyberSarah Control Center",
        "Live-Test Sprint 370: erster autonomer X-Post mit Auto-Refresh-Token",
        "orion",
        dedupeKey,
      ],
    );
    console.log(`[db-ops] X-Live-Test-Job eingereiht: id=${result.rows[0].id}, user=${openId}, faellig=${result.rows[0].scheduled_for.toISOString()}`);
    console.log("[db-ops] Der Live-Autopilot verarbeitet ihn im naechsten 60-Sekunden-Tick.");
  } finally {
    client.release();
  }
}

async function status() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, platform, persona, status, mode, external_id, attempts, last_error, scheduled_for, published_at
         FROM "publishingJobs" ORDER BY id DESC LIMIT 5`,
    );
    if (result.rows.length === 0) {
      console.log("[db-ops] Keine Publishing-Jobs vorhanden.");
      return;
    }
    for (const row of result.rows) {
      console.log(
        `[db-ops] id=${row.id} ${row.platform}/${row.persona} status=${row.status} mode=${row.mode ?? "-"} ` +
          `external=${row.external_id ?? "-"} attempts=${row.attempts} ` +
          `scheduled=${row.scheduled_for.toISOString()} published=${row.published_at ? row.published_at.toISOString() : "-"} ` +
          `error=${row.last_error ?? "-"}`,
      );
    }
  } finally {
    client.release();
  }
}


async function diagnose() {
  const client = await pool.connect();
  try {
    const info = await client.query(
      "SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS host, current_setting('search_path', true) AS search_path",
    );
    console.log("[db-ops] Ziel-DB:", JSON.stringify(info.rows[0]));
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    console.log("[db-ops] public-Tabellen (" + tables.rows.length + "):", tables.rows.map((r) => r.table_name).join(", "));
    const journal = await client.query(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5",
    ).catch((err) => ({ rows: [], journalError: err.message }));
    if (journal.journalError) {
      console.log("[db-ops] Kein Drizzle-Journal:", journal.journalError);
    } else {
      console.log("[db-ops] Journal (neueste 5):", journal.rows.map((r) => r.hash.slice(0, 16)).join(", "));
    }
  } finally {
    client.release();
  }
}

try {
  if (OP === "publishing-enqueue-live-test") await enqueue();
  else if (OP === "publishing-status") await status();
  else if (OP === "publishing-diagnose") await diagnose();
  else {
    console.error(`[db-ops] Unbekannte Publishing-Operation: ${OP}`);
    process.exit(1);
  }
} finally {
  await pool.end();
}

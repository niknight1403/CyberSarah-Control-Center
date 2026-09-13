// Sprint 85 (Follow-up): Postgres-Persistenz als KOSTENLOSE Alternative zur
// Render Persistent Disk. Der Service laeuft auf Render Free (ephemerales
// Dateisystem) — Workspace-Daten ueberleben dort kein Re-Deploy. Diese
// Schicht spiegelt die beiden wirklich verlustfaehigen Zustaende in das
// bereits vorhandene Neon-Postgres (Free-Tier, DATABASE_URL des Projekts):
//
//   1. Audit-Events  → workspace_service.audit_events
//      (Compliance-Trail externer Aktionen, aktuell nur lokale JSONL)
//   2. Nicht gepushte Datei-Schreibvorgänge → workspace_service.workspace_file_backups
//      (WIP zwischen "Datei geschrieben" und "git push" — nach einem Re-Deploy
//      wird der Workspace frisch geclont und das WIP wiederhergestellt)
//
// Bewusstes Design:
//   - Workspaces selbst sind Git-Clones: GitHub ist das primaere, dauerhafte
//     Storage-Backend — der Clone wird bei Bedarf neu erzeugt.
//   - Committed-aber-nicht-gepushte Commits bleiben verloren (bekannte
//     Grenze; Git-Objekte zu spiegeln waere unvertretbar komplex).
//   - Graceful Degradation: Ohne WORKSPACE_DATABASE_URL oder bei DB-Fehlern
//     laeuft alles wie bisher lokal-ephemeral weiter (Warnung im Log) — der
//     Health-Endpoint meldet dann ehrlich "ephemeral".
//   - Eigenes Schema workspace_service: keine Kollision mit den Tabellen
//     der Haupt-App (Schema public).
import pg from "pg";

const SCHEMA = "workspace_service";
const STARTUP_HEARTBEAT_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 4_000;

/** Extrahiert WORKSPACE_DATABASE_URL aus env (trim) oder null. */
export function databaseUrlFromEnv(env) {
  const url = typeof env?.WORKSPACE_DATABASE_URL === "string" ? env.WORKSPACE_DATABASE_URL.trim() : "";
  if (!url) return null;
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null; // Ungueltige URL: bewusst kein Pool-Start (ephemeral bleiben).
  }
  return { url, hostname };
}

/** SSL-Option: Neon/Cloud-DBs brauchen TLS; lokale Postgres-Tests nicht. */
function sslOptionFor(hostname) {
  return /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)$/.test(hostname)
    ? undefined
    : { rejectUnauthorized: false };
}

/**
 * Erstellt (lazy verbindenden) Pool + Operationen. Testbar: `PoolImpl`
 * injizierbar, `now` fuer Zeitstempel. Gibt null zurueck, wenn keine URL
 * konfiguriert ist.
 */
export function createPersistence({ env, PoolImpl = pg.Pool, now = () => new Date() } = {}) {
  const configured = databaseUrlFromEnv(env);
  if (!configured) return null;
  const pool = new PoolImpl({
    connectionString: configured.url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
    ssl: sslOptionFor(configured.hostname),
  });
  const withTimeout = (promise, ms = QUERY_TIMEOUT_MS) =>
    Promise.race([promise, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("DB-Timeout")), ms))]);

  return {
    pool,
    url: configured.url,
    heartbeat() {
      return withTimeout(pool.query("SELECT 1")).then(() => true);
    },
    async initSchema() {
      await withTimeout(
        pool.query(
          `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
           CREATE TABLE IF NOT EXISTS ${SCHEMA}.audit_events (
             id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
             event_id TEXT NOT NULL UNIQUE,
             action TEXT NOT NULL,
             status TEXT NOT NULL,
             repository TEXT,
             branch TEXT,
             commit_sha TEXT,
             run_id TEXT,
             message TEXT,
             metadata JSONB,
             occurred_at TIMESTAMPTZ NOT NULL
           );
           CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_file_backups (
             workspace_id TEXT NOT NULL,
             file_path TEXT NOT NULL,
             content TEXT NOT NULL,
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
             PRIMARY KEY (workspace_id, file_path)
           );`,
        ),
      );
    },
    /** Audit-Event anhaengen — idempotent via event_id (ON CONFLICT DO NOTHING). */
    async appendAuditEvent(event) {
      await withTimeout(
        pool.query(
          `INSERT INTO ${SCHEMA}.audit_events
             (event_id, action, status, repository, branch, commit_sha, run_id, message, metadata, occurred_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (event_id) DO NOTHING`,
          [
            event.eventId,
            event.action,
            event.status,
            event.repository ?? null,
            event.branch ?? null,
            event.commitSha ?? null,
            event.runId ?? null,
            event.message ?? null,
            event.metadata === undefined || event.metadata === null ? null : JSON.stringify(event.metadata),
            event.occurredAt ?? now().toISOString(),
          ],
        ),
      );
    },
    /** WIP-Datei sichern (Upsert). Nach erfolgreichem Push wird geloescht. */
    async saveFileBackup(workspaceId, filePath, content) {
      await withTimeout(
        pool.query(
          `INSERT INTO ${SCHEMA}.workspace_file_backups (workspace_id, file_path, content, updated_at)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (workspace_id, file_path)
           DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at`,
          [workspaceId, filePath, content, now().toISOString()],
        ),
      );
    },
    /** Gesicherte WIP-Dateien eines Workspaces lesen (aelteste zuerst). */
    async restoreFileBackups(workspaceId, apply) {
      const { rows } = await withTimeout(
        pool.query(
          `SELECT file_path, content FROM ${SCHEMA}.workspace_file_backups
           WHERE workspace_id = $1 ORDER BY updated_at ASC`,
          [workspaceId],
        ),
      );
      for (const row of rows) await apply(row.file_path, row.content);
      return rows.length;
    },
    /** WIP verwerfen — Inhalt ist via Push dauerhaft bei GitHub. */
    async clearFileBackups(workspaceId) {
      await withTimeout(pool.query(`DELETE FROM ${SCHEMA}.workspace_file_backups WHERE workspace_id = $1`, [workspaceId]));
    },
  };
}

/** Startup-Verbindung: Heartbeat + Schema, mit Gesamtbudget. Gibt true/false. */
export async function connectPersistence(persistence, timeoutMs = STARTUP_HEARTBEAT_TIMEOUT_MS) {
  if (!persistence) return false;
  try {
    const connected = await Promise.race([
      (async () => {
        await persistence.heartbeat();
        await persistence.initSchema();
        return true;
      })(),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Startup-DB-Timeout")), timeoutMs)),
    ]);
    return connected === true;
  } catch {
    return false;
  }
}

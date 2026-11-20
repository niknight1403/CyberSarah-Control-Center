import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.GXP_AUDIT_TEST_DATABASE_URL;
if (!connectionString) throw new Error("GXP_AUDIT_TEST_DATABASE_URL is required.");

const pool = new Pool({ connectionString });
const migration = readFileSync(resolve(process.cwd(), "drizzle/0038_gxp_audit_ledger.sql"), "utf8");

async function expectBlocked(label: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes("append-only")) return;
    throw error;
  }
  throw new Error(`Expected GxP audit ${label} to be rejected by database trigger.`);
}

try {
  await pool.query("CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY)");
  await pool.query(migration);
  const user = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
  const actorId = user.rows[0].id as number;
  const inserted = await pool.query(
    `INSERT INTO gxp_audit_events
      (actor_user_id, framework, activity, assessment_status, missing_controls, event_payload, previous_hash, event_hash)
     VALUES ($1, 'GMP', 'quality_event', 'blocked', '[]'::jsonb, '{"automationMode":"assessment_only"}'::jsonb, $2, $3)
     RETURNING id`,
    [actorId, "0".repeat(64), "a".repeat(64)],
  );
  const eventId = inserted.rows[0].id as number;
  await expectBlocked("UPDATE", () => pool.query("UPDATE gxp_audit_events SET activity = 'release' WHERE id = $1", [eventId]));
  await expectBlocked("DELETE", () => pool.query("DELETE FROM gxp_audit_events WHERE id = $1", [eventId]));
  await expectBlocked("TRUNCATE", () => pool.query("TRUNCATE gxp_audit_events"));
  const count = await pool.query("SELECT count(*)::int AS count FROM gxp_audit_events");
  if (count.rows[0].count !== 1) throw new Error("Audit row count changed after rejected mutations.");
  console.log("GxP audit migration passed: insert allowed; UPDATE, DELETE and TRUNCATE rejected.");
} finally {
  await pool.end();
}

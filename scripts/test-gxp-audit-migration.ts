import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  GXP_AUDIT_GENESIS_HASH,
  hashGxpAuditEvent,
  verifyGxpAuditEvents,
} from "../lib/gxp-audit-logic";

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

  // Simulate concurrent application writers using the same transaction-scoped lock.
  await Promise.all(Array.from({ length: 16 }, async (_, index) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(721904321::bigint)");
      const previous = await client.query(
        "SELECT event_hash FROM gxp_audit_events ORDER BY id DESC LIMIT 1",
      );
      const previousHash = (previous.rows[0]?.event_hash as string | undefined) ?? GXP_AUDIT_GENESIS_HASH;
      const createdAt = new Date(Date.now() + index);
      const input = {
        actorUserId: actorId,
        framework: "GMP",
        activity: "quality_event",
        assessmentStatus: "blocked",
        missingControls: ["controlled_sop_reference"],
        eventPayload: { automationMode: "assessment_only", testSequence: index },
        previousHash,
        createdAt,
      };
      const eventHash = hashGxpAuditEvent(input);
      await client.query(
        `INSERT INTO gxp_audit_events
          (actor_user_id, framework, activity, assessment_status, missing_controls, event_payload, previous_hash, event_hash, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
        [actorId, input.framework, input.activity, input.assessmentStatus,
          JSON.stringify(input.missingControls), JSON.stringify(input.eventPayload),
          previousHash, eventHash, createdAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }));

  const rows = await pool.query(
    `SELECT id, actor_user_id AS "actorUserId", framework, activity,
      assessment_status AS "assessmentStatus", missing_controls AS "missingControls",
      event_payload AS "eventPayload", previous_hash AS "previousHash",
      event_hash AS "eventHash", created_at AS "createdAt"
     FROM gxp_audit_events ORDER BY id`,
  );
  const verification = verifyGxpAuditEvents(rows.rows);
  if (!verification.valid || verification.checkedEvents !== 16) {
    throw new Error(`Concurrent GxP audit chain invalid: ${JSON.stringify(verification)}`);
  }

  const eventId = rows.rows[0].id as number;
  await expectBlocked("UPDATE", () => pool.query("UPDATE gxp_audit_events SET activity = 'release' WHERE id = $1", [eventId]));
  await expectBlocked("DELETE", () => pool.query("DELETE FROM gxp_audit_events WHERE id = $1", [eventId]));
  await expectBlocked("TRUNCATE", () => pool.query("TRUNCATE gxp_audit_events"));
  const count = await pool.query("SELECT count(*)::int AS count FROM gxp_audit_events");
  if (count.rows[0].count !== 16) throw new Error("Audit row count changed after rejected mutations.");
  console.log("GxP audit migration passed: 16 concurrent writes formed one valid chain; UPDATE, DELETE and TRUNCATE rejected.");
} finally {
  await pool.end();
}

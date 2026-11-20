-- GxP-specific append-only audit ledger.
-- Hash chaining is serialized by a transaction-scoped advisory lock in the application.
CREATE TABLE IF NOT EXISTS "gxp_audit_events" (
  "id" bigserial PRIMARY KEY,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id"),
  "framework" varchar(16) NOT NULL,
  "activity" varchar(32) NOT NULL,
  "assessment_status" varchar(32) NOT NULL,
  "missing_controls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "event_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "previous_hash" varchar(64) NOT NULL,
  "event_hash" varchar(64) NOT NULL UNIQUE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "gxp_audit_events_created_idx"
  ON "gxp_audit_events" ("created_at");
CREATE INDEX IF NOT EXISTS "gxp_audit_events_actor_idx"
  ON "gxp_audit_events" ("actor_user_id", "created_at");

CREATE OR REPLACE FUNCTION "reject_gxp_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'gxp_audit_events is append-only; UPDATE, DELETE and TRUNCATE are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS "gxp_audit_no_update_delete" ON "gxp_audit_events";
CREATE TRIGGER "gxp_audit_no_update_delete"
  BEFORE UPDATE OR DELETE ON "gxp_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_gxp_audit_mutation"();

DROP TRIGGER IF EXISTS "gxp_audit_no_truncate" ON "gxp_audit_events";
CREATE TRIGGER "gxp_audit_no_truncate"
  BEFORE TRUNCATE ON "gxp_audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_gxp_audit_mutation"();

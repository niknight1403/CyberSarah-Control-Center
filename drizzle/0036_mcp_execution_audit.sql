-- Sprint 9: Audit jedes Werkzeugaufrufs aus einem Lauf.
-- Gespeichert werden Schluessel, Typen und ein Hash der Argumente — niemals
-- Werte, damit Zugangsdaten nicht im Audit landen.
CREATE TABLE IF NOT EXISTS "mcp_execution_audit" (
  "id" serial PRIMARY KEY,
  "run_id" integer,
  "task_id" varchar(64) NOT NULL,
  "agent_key" varchar(48) NOT NULL,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120) NOT NULL,
  "decision" varchar(24) NOT NULL,
  "risk_level" varchar(16) NOT NULL,
  "arg_keys" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "args_hash" varchar(64) NOT NULL,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "attempt" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_execution_audit_run_idx" ON "mcp_execution_audit" ("run_id");
CREATE INDEX IF NOT EXISTS "mcp_execution_audit_created_idx" ON "mcp_execution_audit" ("created_at");
CREATE INDEX IF NOT EXISTS "mcp_execution_audit_agent_idx" ON "mcp_execution_audit" ("agent_key");

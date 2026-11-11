-- Sprint 10: Freigabe-Workflow fuer Werkzeugaufrufe.
-- Eine Freigabe deckt genau einen Aufruf (Lauf, Aufgabe, Werkzeug, Argument-Hash)
-- und laeuft ab. Stimmen liegen als JSON vor, damit das Vier-Augen-Prinzip
-- nachvollziehbar bleibt.
CREATE TABLE IF NOT EXISTS "mcp_approval_requests" (
  "id" serial PRIMARY KEY,
  "run_id" integer NOT NULL,
  "task_id" varchar(64) NOT NULL,
  "agent_key" varchar(48) NOT NULL,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120) NOT NULL,
  "risk_level" varchar(16) NOT NULL,
  "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "args_hash" varchar(64) NOT NULL,
  "required_approvals" integer NOT NULL DEFAULT 1,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "requested_by" varchar(120) NOT NULL,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "decided_at" timestamp with time zone,
  "votes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_approval_requests_run_idx" ON "mcp_approval_requests" ("run_id");
CREATE INDEX IF NOT EXISTS "mcp_approval_requests_status_idx" ON "mcp_approval_requests" ("status");
CREATE INDEX IF NOT EXISTS "mcp_approval_requests_expires_idx" ON "mcp_approval_requests" ("expires_at");

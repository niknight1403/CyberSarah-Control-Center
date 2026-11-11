-- Sprint 3: Governance-Gateway fuer MCP-Werkzeuge.
-- Faehigkeitsprofil, Risikostufe und Entscheidung je Werkzeug, dazu
-- Freigabeanfragen (Human-in-the-Loop) mit Ablaufzeit. Freigaben gelten nur
-- fuer die gespeicherte Schema-Signatur; aendert der Server das Tool-Schema,
-- muss neu entschieden werden.
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "governance_mode" varchar(16) NOT NULL DEFAULT 'assisted';

CREATE TABLE IF NOT EXISTS "mcp_tool_governance" (
  "id" serial PRIMARY KEY,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120) NOT NULL,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "primary_capability" varchar(32) NOT NULL DEFAULT 'other',
  "risk_level" varchar(16) NOT NULL DEFAULT 'low',
  "decision" varchar(24) NOT NULL DEFAULT 'approval_required',
  "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "signature" varchar(64) NOT NULL DEFAULT '',
  "reviewed_by" varchar(255),
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tool_governance_key_idx"
  ON "mcp_tool_governance" ("server_key", "tool_name");
CREATE INDEX IF NOT EXISTS "mcp_tool_governance_risk_idx"
  ON "mcp_tool_governance" ("risk_level", "decision");

CREATE TABLE IF NOT EXISTS "mcp_approvals" (
  "id" serial PRIMARY KEY,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120) NOT NULL,
  "risk_level" varchar(16) NOT NULL DEFAULT 'high',
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "reason" varchar(500),
  "args_preview" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requested_by" varchar(255),
  "decided_by" varchar(255),
  "decided_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_approvals_status_idx"
  ON "mcp_approvals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_approvals_tool_idx"
  ON "mcp_approvals" ("server_key", "tool_name");

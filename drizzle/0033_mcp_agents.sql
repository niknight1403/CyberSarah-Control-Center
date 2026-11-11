-- Sprint 6: Agent Factory — spezifizierte Agenten mit Werkzeugvergabe.
-- Ein Agent ist eine pruefbare Spezifikation (Prompt, Rechte, Budget, Tests),
-- keine laufende Instanz; Laeufe entstehen spaeter ueber den Autopiloten.
CREATE TABLE IF NOT EXISTS "mcp_agent_specs" (
  "id" serial PRIMARY KEY,
  "agent_key" varchar(48) NOT NULL,
  "name" varchar(80) NOT NULL,
  "role" varchar(24) NOT NULL,
  "purpose" text NOT NULL,
  "system_prompt" text NOT NULL,
  "security" jsonb NOT NULL,
  "acceptance_tests" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "quality_criteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "monitoring" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "status" varchar(16) NOT NULL DEFAULT 'draft',
  "created_by" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_agent_specs_key_idx" ON "mcp_agent_specs" ("agent_key");
CREATE INDEX IF NOT EXISTS "mcp_agent_specs_status_idx" ON "mcp_agent_specs" ("status");

CREATE TABLE IF NOT EXISTS "mcp_agent_grants" (
  "id" serial PRIMARY KEY,
  "agent_id" integer NOT NULL REFERENCES "mcp_agent_specs" ("id") ON DELETE CASCADE,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120) NOT NULL,
  "risk_level" varchar(16) NOT NULL,
  "purpose" varchar(200) NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_agent_grants_unique_idx"
  ON "mcp_agent_grants" ("agent_id", "server_key", "tool_name");
CREATE INDEX IF NOT EXISTS "mcp_agent_grants_agent_idx" ON "mcp_agent_grants" ("agent_id");

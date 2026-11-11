-- Master-Prompt Phase 2: mehrere MCP-Server statt einer ENV-Variable.
-- Berechtigungsprofil, Kostenprofil und Health-Zustand liegen je Server in
-- der Datenbank; Secrets bleiben ausserhalb (nur der ENV-Variablenname).
CREATE TABLE IF NOT EXISTS "mcp_servers" (
  "id" serial PRIMARY KEY,
  "server_key" varchar(64) NOT NULL,
  "name" varchar(120) NOT NULL,
  "base_url" text NOT NULL,
  "transport" varchar(24) NOT NULL DEFAULT 'streamable-http',
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "credential_env_var" varchar(80),
  "cost_profile" varchar(16) NOT NULL DEFAULT 'unknown',
  "enabled" boolean NOT NULL DEFAULT true,
  "notes" text,
  "health_status" varchar(16) NOT NULL DEFAULT 'unchecked',
  "health_score" integer,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "last_checked_at" timestamp with time zone,
  "last_ok_at" timestamp with time zone,
  "last_error_at" timestamp with time zone,
  "last_error" varchar(300),
  "server_name" varchar(120),
  "server_version" varchar(60),
  "tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tools_discovered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_servers_key_idx" ON "mcp_servers" ("server_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_enabled_idx" ON "mcp_servers" ("enabled", "health_status");

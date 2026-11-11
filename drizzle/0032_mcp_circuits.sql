-- Sprint 5: Circuit-Breaker-Zustand je Server und Werkzeug.
-- Der Zustand ist Betriebswissen, keine Konfiguration: er darf neu aufgebaut
-- werden, ohne dass Aufrufe falsch erlaubt werden.
CREATE TABLE IF NOT EXISTS "mcp_circuits" (
  "id" serial PRIMARY KEY,
  "server_key" varchar(64) NOT NULL,
  "tool_name" varchar(120),
  "state" varchar(16) NOT NULL DEFAULT 'closed',
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "open_until" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "half_open_attempts" integer NOT NULL DEFAULT 0,
  "last_failure_kind" varchar(24),
  "last_error" varchar(300),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_circuits_key_idx"
  ON "mcp_circuits" ("server_key", COALESCE("tool_name", ''));

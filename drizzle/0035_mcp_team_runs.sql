-- Sprint 8: Run-Engine — persistierte Laeufe ueber gespeicherte Plaene.
-- Der Zustand inkl. Schritten liegt als JSON, damit ein Lauf nach einem
-- Neustart weiterlesbar und nachvollziehbar bleibt.
CREATE TABLE IF NOT EXISTS "mcp_team_runs" (
  "id" serial PRIMARY KEY,
  "plan_id" integer NOT NULL REFERENCES "mcp_team_plans" ("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "state" jsonb NOT NULL,
  "spent_cents" integer NOT NULL DEFAULT 0,
  "steps_used" integer NOT NULL DEFAULT 0,
  "abort_reason" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_by" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_team_runs_plan_idx" ON "mcp_team_runs" ("plan_id");
CREATE INDEX IF NOT EXISTS "mcp_team_runs_status_idx" ON "mcp_team_runs" ("status");
CREATE INDEX IF NOT EXISTS "mcp_team_runs_created_idx" ON "mcp_team_runs" ("created_at");

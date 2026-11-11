-- Sprint 7: Team-Orchestrierung — gespeicherte Plaene.
-- Ein Plan ist eine Momentaufnahme: Aufgaben, Zuweisungen, Reihenfolge,
-- Kostenschaetzung und Budgetaufteilung. Laeufe (Sprint 8) referenzieren ihn.
CREATE TABLE IF NOT EXISTS "mcp_team_plans" (
  "id" serial PRIMARY KEY,
  "objective" text NOT NULL,
  "plan" jsonb NOT NULL,
  "allocations" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budget_cents" integer NOT NULL,
  "task_count" integer NOT NULL DEFAULT 0,
  "open_count" integer NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'planned',
  "created_by" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_team_plans_status_idx" ON "mcp_team_plans" ("status");
CREATE INDEX IF NOT EXISTS "mcp_team_plans_created_idx" ON "mcp_team_plans" ("created_at");

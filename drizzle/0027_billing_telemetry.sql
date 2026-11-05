-- Nutzungsmessung, Guthaben-Buchungen und Revenue-Loop-Historie.
-- Handgepflegte Migration (die Snapshot-Kette endet bei 0012; ab 0013 werden
-- Migrationen wie hier bewusst von Hand geschrieben und im Journal gestempelt).
-- Alle Anweisungen sind idempotent, damit ein erneuter Lauf nicht bricht.

-- Ein Datensatz je Revenue-Loop-Durchlauf (append-only, Lernhistorie).
CREATE TABLE IF NOT EXISTS "revenue_loop_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_key" varchar(190) NOT NULL UNIQUE,
  "lever_key" varchar(120),
  "lever_title" varchar(200),
  "status" varchar(24) DEFAULT 'optimize' NOT NULL,
  "verdict" varchar(24),
  "mrr_eur_before" integer,
  "mrr_eur_after" integer,
  "delta_pct" numeric(8, 2),
  "reach_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "network_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "directive" varchar(32),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_loop_runs_created_idx" ON "revenue_loop_runs" ("created_at");
--> statement-breakpoint

-- Ausführungsprotokoll für Agenten-/LLM-Läufe (nur Kennzahlen, keine Prompts).
CREATE TABLE IF NOT EXISTS "agent_executions" (
  "id" serial PRIMARY KEY NOT NULL,
  "execution_key" varchar(190) NOT NULL UNIQUE,
  "user_open_id" varchar(64) NOT NULL,
  "agent_id" varchar(64),
  "surface" varchar(40) DEFAULT 'api' NOT NULL,
  "provider" varchar(32) DEFAULT 'unknown' NOT NULL,
  "model" varchar(120),
  "status" varchar(16) DEFAULT 'ok' NOT NULL,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "cost_eur" numeric(12, 4),
  "duration_ms" integer,
  "error_code" varchar(60),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_executions_user_created_idx" ON "agent_executions" ("user_open_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_executions_agent_idx" ON "agent_executions" ("agent_id");
--> statement-breakpoint

-- Guthaben-Buchungen (append-only): Summe = Kontostand.
CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_open_id" varchar(64) NOT NULL,
  "delta_tokens" integer NOT NULL,
  "kind" varchar(24) NOT NULL,
  "reason" varchar(120),
  "execution_key" varchar(190),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger_entries" ("user_open_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_execution_idx" ON "credit_ledger_entries" ("user_open_id", "execution_key", "kind");

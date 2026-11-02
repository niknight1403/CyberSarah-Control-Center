-- Revenue-Loop-Iterationen: ein Datensatz je Durchlauf, append-only.
-- Der Loop misst Umsatz/Reichweite/B2B, priorisiert den größten Hebel und
-- dokumentiert das Urteil (scale/iterate/stop) für den nächsten Lauf.
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

CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" serial PRIMARY KEY,
  "user_open_id" varchar(64) NOT NULL,
  "delta_tokens" integer NOT NULL,
  "kind" varchar(24) NOT NULL,
  "reason" varchar(120),
  "execution_key" varchar(190),
  "payment_intent" varchar(190),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger_entries" ("user_open_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_payment_intent_idx" ON "credit_ledger_entries" ("payment_intent");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_execution_idx" ON "credit_ledger_entries" ("user_open_id", "execution_key", "kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "aggregate_key" text,
  "status" text NOT NULL,
  "event_created_at" timestamp with time zone,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  "attempts" integer NOT NULL DEFAULT 1,
  "last_error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_aggregate_idx" ON "stripe_webhook_events" ("aggregate_key", "event_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_status_idx" ON "stripe_webhook_events" ("status", "received_at");

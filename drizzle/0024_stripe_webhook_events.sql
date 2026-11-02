-- Sprint 25: dauerhafte Idempotenz-Belege je Stripe-Webhook-Event.
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY,
  "type" text NOT NULL,
  "aggregate_key" text,
  "status" text NOT NULL CHECK ("status" IN ('processing','processed','failed')),
  "event_created_at" timestamptz,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 1,
  "last_error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_aggregate_idx" ON "stripe_webhook_events" ("aggregate_key","event_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_status_idx" ON "stripe_webhook_events" ("status","received_at");

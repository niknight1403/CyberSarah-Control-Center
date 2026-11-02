-- Nur fuer CI-Integrationstests (lokal, influenza_stripe_ci). Idempotent.
CREATE TABLE IF NOT EXISTS "b2b_network_nodes" (
  "id" serial PRIMARY KEY,
  "node_key" varchar(180) NOT NULL UNIQUE,
  "kind" varchar(24) NOT NULL,
  "name" varchar(220) NOT NULL,
  "domain" varchar(255),
  "fit" integer NOT NULL DEFAULT 0,
  "intent" integer NOT NULL DEFAULT 0,
  "trust" integer NOT NULL DEFAULT 0,
  "relationship_strength" integer NOT NULL DEFAULT 0,
  "estimated_value_cents" integer,
  "opted_out" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_activity_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_jobs" (
  "id" serial PRIMARY KEY,
  "dedupe_key" varchar(180) NOT NULL UNIQUE,
  "kind" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'queued',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_attribution_events" (
  "id" serial PRIMARY KEY,
  "event_key" varchar(200) NOT NULL UNIQUE,
  "persona_id" varchar(40) NOT NULL,
  "content_id" varchar(120) NOT NULL,
  "platform" varchar(40) NOT NULL,
  "event_type" varchar(24) NOT NULL,
  "value_cents" integer NOT NULL DEFAULT 0,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

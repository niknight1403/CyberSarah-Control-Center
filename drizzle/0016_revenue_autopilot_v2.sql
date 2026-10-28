CREATE TABLE IF NOT EXISTS "revenue_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "dedupe_key" varchar(180) NOT NULL,
  "kind" varchar(64) NOT NULL,
  "status" varchar(24) DEFAULT 'queued' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "deferred_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_jobs_status_idx" ON "revenue_jobs" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_offers" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(32) NOT NULL,
  "name" varchar(220) NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "price_cents" integer,
  "margin_pct" integer,
  "target_url" varchar(800),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_offers_status_idx" ON "revenue_offers" USING btree ("status","kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_experiments" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(220) NOT NULL,
  "dimension" varchar(32) NOT NULL,
  "status" varchar(24) DEFAULT 'learning' NOT NULL,
  "variants" jsonb NOT NULL,
  "decision" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_attribution_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_key" varchar(200) NOT NULL,
  "persona_id" varchar(40) NOT NULL,
  "content_id" varchar(120) NOT NULL,
  "platform" varchar(40) NOT NULL,
  "event_type" varchar(24) NOT NULL,
  "value_cents" integer DEFAULT 0 NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_attribution_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_attr_content_idx" ON "revenue_attribution_events" USING btree ("content_id","event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_attr_persona_idx" ON "revenue_attribution_events" USING btree ("persona_id","occurred_at");

-- Repair migration: production history had journal entries for 0016/0018 while the
-- corresponding relations were absent. Replaying the idempotent CREATE IF NOT EXISTS
-- statements under a new journal entry repairs that drift without destructive DDL.

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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_cost_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_key" varchar(200) NOT NULL,
  "category" varchar(32) NOT NULL,
  "amount_cents" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_cost_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_cost_category_idx" ON "revenue_cost_events" USING btree ("category","occurred_at");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "b2b_network_nodes" (
  "id" serial PRIMARY KEY NOT NULL,
  "node_key" varchar(180) NOT NULL UNIQUE,
  "kind" varchar(24) NOT NULL,
  "name" varchar(220) NOT NULL,
  "domain" varchar(255),
  "fit" integer DEFAULT 0 NOT NULL,
  "intent" integer DEFAULT 0 NOT NULL,
  "trust" integer DEFAULT 0 NOT NULL,
  "relationship_strength" integer DEFAULT 0 NOT NULL,
  "estimated_value_cents" integer,
  "opted_out" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_activity_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "b2b_network_kind_idx" ON "b2b_network_nodes" ("kind","updated_at");
CREATE INDEX IF NOT EXISTS "b2b_network_activity_idx" ON "b2b_network_nodes" ("last_activity_at");

CREATE TABLE IF NOT EXISTS "b2b_network_edges" (
  "id" serial PRIMARY KEY NOT NULL,
  "edge_key" varchar(220) NOT NULL UNIQUE,
  "from_node_key" varchar(180) NOT NULL,
  "to_node_key" varchar(180) NOT NULL,
  "relation" varchar(40) NOT NULL,
  "stage" varchar(32) DEFAULT 'discovered' NOT NULL,
  "strength" integer DEFAULT 0 NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "b2b_edges_from_idx" ON "b2b_network_edges" ("from_node_key","stage");
CREATE INDEX IF NOT EXISTS "b2b_edges_to_idx" ON "b2b_network_edges" ("to_node_key","stage");

CREATE TABLE IF NOT EXISTS "influencer_learning_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "persona_id" varchar(40) NOT NULL UNIQUE,
  "version" integer DEFAULT 1 NOT NULL,
  "observations" integer DEFAULT 0 NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "platform_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pillar_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "next_experiments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "learned_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "influencer_learning_score_idx" ON "influencer_learning_states" ("score","updated_at");


-- Idempotente Reparatur der Revenue-Tabellen. Die Migration ist im Journal
-- als angewandt vermerkt, die Tabellen fehlen jedoch in der Produktions-DB.
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
CREATE INDEX IF NOT EXISTS "revenue_attr_content_idx" ON "revenue_attribution_events" USING btree ("content_id","event_type");
CREATE INDEX IF NOT EXISTS "revenue_attr_persona_idx" ON "revenue_attribution_events" USING btree ("persona_id","occurred_at");

CREATE TABLE IF NOT EXISTS "revenue_cost_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_key" varchar(200) NOT NULL,
  "category" varchar(32) NOT NULL,
  "amount_cents" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_cost_events_event_key_unique" UNIQUE("event_key")
);
CREATE INDEX IF NOT EXISTS "revenue_cost_category_idx" ON "revenue_cost_events" USING btree ("category","occurred_at");

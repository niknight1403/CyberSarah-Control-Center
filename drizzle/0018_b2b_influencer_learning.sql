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

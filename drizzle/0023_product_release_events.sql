-- Sprint 30: append-only Freigabe-Ereignisse des Admin-Produktkatalogs.
-- Keine Stripe-Schreibzugriffe; nur serverseitige Admin-Prozeduren schreiben.
CREATE TABLE IF NOT EXISTS "product_release_events" (
  "id" serial PRIMARY KEY,
  "product_id" text NOT NULL,
  "product_name" text NOT NULL,
  "mode" text NOT NULL,
  "action" text NOT NULL CHECK ("action" IN ('approved','withdrawn')),
  "verdict" text NOT NULL,
  "actor_open_id" text NOT NULL,
  "issues_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text,
  "catalog_complete" boolean NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_release_events_product_idx" ON "product_release_events" ("product_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_release_events_actor_idx" ON "product_release_events" ("actor_open_id","created_at");

-- Append-only administrative review evidence; only server-side admin procedure may insert.
CREATE TABLE IF NOT EXISTS "publishing_review_events" (
  "id" serial PRIMARY KEY,
  "job_id" integer NOT NULL,
  "user_open_id" text NOT NULL,
  "actor_open_id" text NOT NULL,
  "resolution" text NOT NULL CHECK ("resolution" IN ('confirmed_published','closed_without_replay')),
  "evidence" text NOT NULL,
  "external_id" text,
  "reviewed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_review_events_owner_idx" ON "publishing_review_events" ("user_open_id","reviewed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_review_events_job_idx" ON "publishing_review_events" ("job_id");

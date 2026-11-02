ALTER TABLE "publishingJobs" ADD COLUMN IF NOT EXISTS "content_override" text;
ALTER TABLE "publishingJobs" ADD COLUMN IF NOT EXISTS "source_draft_id" integer;
CREATE UNIQUE INDEX IF NOT EXISTS "publishing_jobs_source_draft_idx" ON "publishingJobs" ("user_open_id","source_draft_id") WHERE "source_draft_id" IS NOT NULL;

ALTER TABLE "publishingJobs" ADD COLUMN "asset_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "publishingJobs" ADD COLUMN "insights" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "publishingJobs" ADD COLUMN "insights_fetched_at" timestamp;
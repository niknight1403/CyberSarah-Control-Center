CREATE TYPE "public"."publishing_status" AS ENUM('geplant', 'sandbox_veroeffentlicht', 'veroeffentlicht', 'fehlgeschlagen', 'abgebrochen');--> statement-breakpoint
CREATE TABLE "publishingJobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_open_id" text NOT NULL,
	"product" text NOT NULL,
	"goal" text NOT NULL,
	"persona" text NOT NULL,
	"platform" text NOT NULL,
	"campaign_day" integer NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "publishing_status" DEFAULT 'geplant' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"mode" text,
	"external_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "publishing_jobs_queue_idx" ON "publishingJobs" USING btree ("user_open_id","status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_jobs_dedupe_idx" ON "publishingJobs" USING btree ("user_open_id","dedupe_key");
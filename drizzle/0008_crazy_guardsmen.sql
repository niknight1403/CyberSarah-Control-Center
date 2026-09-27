CREATE TYPE "public"."draft_kind" AS ENUM('content', 'revenue-loop', 'idea');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "draftQueue" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "draft_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "draft_status" DEFAULT 'pending' NOT NULL,
	"createdBy" varchar(64) DEFAULT 'draft-engine' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decidedBy" varchar(64)
);
--> statement-breakpoint
CREATE INDEX "draftQueue_status_kind_idx" ON "draftQueue" USING btree ("status","kind");
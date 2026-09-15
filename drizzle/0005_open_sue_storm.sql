CREATE TABLE "agentMemoryConsolidations" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" varchar(16) DEFAULT 'cron' NOT NULL,
	"inputCount" integer NOT NULL,
	"survivorCount" integer NOT NULL,
	"mergedAway" integer NOT NULL,
	"invalidated" integer NOT NULL,
	"contradictionCount" integer NOT NULL,
	"retrievalSamples" integer DEFAULT 0 NOT NULL,
	"retrievalHitRatePct" integer DEFAULT 0 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agentMemoryConsolidations_created_idx" ON "agentMemoryConsolidations" USING btree ("createdAt");
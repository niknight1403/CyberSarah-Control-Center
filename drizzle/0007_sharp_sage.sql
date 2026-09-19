CREATE TABLE "agentMemoryVectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"userOpenId" varchar(64) NOT NULL,
	"source" varchar(32) DEFAULT 'agentLearning' NOT NULL,
	"refId" varchar(128),
	"text" text NOT NULL,
	"vector" jsonb NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "designTheme" varchar(32);--> statement-breakpoint
CREATE INDEX "agentMemoryVectors_user_idx" ON "agentMemoryVectors" USING btree ("userOpenId","createdAt");
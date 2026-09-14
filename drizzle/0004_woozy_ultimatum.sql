CREATE TYPE "public"."agent_learning_kind" AS ENUM('build-optimierung', 'fehlerbehebung', 'interaktion', 'entscheidung');--> statement-breakpoint
CREATE TABLE "agentLearnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"userOpenId" varchar(64) NOT NULL,
	"kind" "agent_learning_kind" DEFAULT 'interaktion' NOT NULL,
	"title" varchar(160) NOT NULL,
	"detail" text NOT NULL,
	"keywords" varchar(400) DEFAULT '' NOT NULL,
	"sessionId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agentLearnings_user_idx" ON "agentLearnings" USING btree ("userOpenId","createdAt");
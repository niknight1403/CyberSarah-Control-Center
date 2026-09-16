DO $$
BEGIN
  CREATE TYPE "public"."project_status" AS ENUM('idee', 'in-arbeit', 'pausiert', 'live', 'archiviert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."super_agent_status" AS ENUM('aktiv', 'pausiert', 'archiviert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"userOpenId" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"repositoryUrl" varchar(300) DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'in-arbeit' NOT NULL,
	"lastActivityAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "superAgents" (
	"id" serial PRIMARY KEY NOT NULL,
	"userOpenId" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"color" varchar(16) DEFAULT '#FFB000' NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"status" "super_agent_status" DEFAULT 'aktiv' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"lastActiveAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_user_idx" ON "projects" USING btree ("userOpenId","lastActivityAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "superAgents_user_idx" ON "superAgents" USING btree ("userOpenId","lastActiveAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "superAgents_session_idx" ON "superAgents" USING btree ("userOpenId","sessionId");

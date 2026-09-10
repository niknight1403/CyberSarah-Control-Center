CREATE TABLE "chatMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"userOpenId" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"provider" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL
);

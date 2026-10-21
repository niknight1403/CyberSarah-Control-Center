CREATE TABLE "affiliate_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(300) NOT NULL,
	"url" varchar(500) NOT NULL,
	"platform" varchar(64) DEFAULT 'digistore24' NOT NULL,
	"score" integer,
	"scoreReason" text,
	"commissionPercent" integer,
	"epcCents" integer,
	"conversionCount" integer DEFAULT 0 NOT NULL,
	"revenueCents" integer DEFAULT 0 NOT NULL,
	"discoveredAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_products_slug_idx" ON "affiliate_products" USING btree ("slug");--> statement-breakpoint
CREATE TABLE "funnel_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"hypothesis" text NOT NULL,
	"stages" jsonb NOT NULL,
	"metric" varchar(200) NOT NULL,
	"status" varchar(32) DEFAULT 'awaiting_approval' NOT NULL,
	"affiliateUrl" varchar(800),
	"approvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderKey" varchar(200) NOT NULL,
	"productSlug" varchar(200),
	"eventType" varchar(64) NOT NULL,
	"amountCents" integer DEFAULT 0 NOT NULL,
	"commissionCents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'EUR' NOT NULL,
	"buyerEmailHash" varchar(128),
	"rawPayload" jsonb,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_events_orderKey_idx" ON "conversion_events" USING btree ("orderKey");--> statement-breakpoint
CREATE TABLE "revenue_daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" varchar(10) NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenueCents" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_daily_stats_day_idx" ON "revenue_daily_stats" USING btree ("day");
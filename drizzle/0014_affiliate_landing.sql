ALTER TABLE "funnel_campaigns" ADD COLUMN "slug" varchar(120);
ALTER TABLE "funnel_campaigns" ADD COLUMN "landingJson" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_campaigns_slug_idx" ON "funnel_campaigns" ("slug");
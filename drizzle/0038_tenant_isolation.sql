-- Block 2 (Multi-Tenancy): Kampagnen und Funnels gehoeren einem Konto.
-- Bestehende Zeilen bleiben ohne Eigentuemer (NULL) und sind damit nur fuer
-- Admins sichtbar - es wird kein Eigentuemer erfunden.
ALTER TABLE "funnel_campaigns" ADD COLUMN IF NOT EXISTS "ownerOpenId" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_campaigns_owner_idx" ON "funnel_campaigns" USING btree ("ownerOpenId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_campaigns_owner_status_idx" ON "funnel_campaigns" USING btree ("ownerOpenId","status");

-- Block 2 (Multi-Tenancy): API-Schluessel je Konto. Es wird nur der SHA-256-Hash
-- gespeichert; der Klartext verlaesst den Server genau einmal bei der Erstellung.
CREATE TABLE IF NOT EXISTS "tenant_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerOpenId" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"keyPrefix" varchar(24) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"scope" varchar(16) DEFAULT 'write' NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_api_keys_hash_idx" ON "tenant_api_keys" USING btree ("keyHash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_api_keys_owner_idx" ON "tenant_api_keys" USING btree ("ownerOpenId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_api_keys_owner_active_idx" ON "tenant_api_keys" USING btree ("ownerOpenId","revokedAt");

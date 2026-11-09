-- Wegwerf-Schema fuer den Digistore24-IPN-E2E-Test.
-- Nur die drei Tabellen, die der IPN-Handler wirklich schreibt, in der
-- Spaltenform aus drizzle/schema.ts. Kein Produktionsschema, keine Daten.
CREATE TABLE IF NOT EXISTS affiliate_products (
  id serial PRIMARY KEY,
  slug varchar(200) NOT NULL UNIQUE,
  title varchar(300) NOT NULL,
  url varchar(500) NOT NULL,
  platform varchar(64) DEFAULT 'digistore24' NOT NULL,
  score integer,
  "scoreReason" text,
  "commissionPercent" integer,
  "epcCents" integer,
  "conversionCount" integer DEFAULT 0 NOT NULL,
  "revenueCents" integer DEFAULT 0 NOT NULL,
  "discoveredAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversion_events (
  id serial PRIMARY KEY,
  "orderKey" varchar(200) NOT NULL UNIQUE,
  "productSlug" varchar(200),
  "eventType" varchar(64) NOT NULL,
  "amountCents" integer DEFAULT 0 NOT NULL,
  "commissionCents" integer DEFAULT 0 NOT NULL,
  currency varchar(8) DEFAULT 'EUR' NOT NULL,
  "buyerEmailHash" varchar(128),
  "rawPayload" jsonb,
  "occurredAt" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS revenue_daily_stats (
  id serial PRIMARY KEY,
  day varchar(10) NOT NULL UNIQUE,
  clicks integer DEFAULT 0 NOT NULL,
  conversions integer DEFAULT 0 NOT NULL,
  "revenueCents" integer DEFAULT 0 NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL
);

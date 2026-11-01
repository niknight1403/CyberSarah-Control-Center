-- Sprint 4 (AI Influenza): Stripe-Zahlungsspur in der App-DB.
-- Umsatz (aiZahlungen) und Kosten (Auftrag/aiAufgaben) bleiben getrennt erfasst.
-- Schreibzugriff nur ueber den Webhook nach Signaturpruefung; revenue_os bleibt read-only.

CREATE TABLE IF NOT EXISTS "aiStripeEreignisse" (
  id serial PRIMARY KEY,
  stripe_event_id varchar(255) NOT NULL UNIQUE,
  event_typ varchar(96) NOT NULL,
  modus varchar(8) NOT NULL,
  aktion varchar(48) NOT NULL,
  verarbeitet boolean NOT NULL DEFAULT false,
  fehler text,
  empfangen_am timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "aiKundenAuftraege" (
  id serial PRIMARY KEY,
  kunde_id integer NOT NULL,
  angebot_id integer NOT NULL,
  paket varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'onboarding',
  stripe_customer_id varchar(255),
  stripe_subscription_id varchar(255) UNIQUE,
  modus varchar(8) NOT NULL,
  abo_status varchar(24) NOT NULL DEFAULT 'aktiv',
  kosten_cent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kunde_id, angebot_id)
);

CREATE TABLE IF NOT EXISTS "aiZahlungen" (
  id serial PRIMARY KEY,
  auftrag_id integer REFERENCES "aiKundenAuftraege"(id) ON DELETE SET NULL,
  stripe_rechnung_id varchar(255) UNIQUE,
  stripe_subscription_id varchar(255),
  betrag_cent integer NOT NULL CHECK (betrag_cent >= 0),
  waehrung varchar(3) NOT NULL DEFAULT 'EUR',
  status varchar(16) NOT NULL DEFAULT 'bezahlt',
  modus varchar(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "aiZahlungen_auftrag_idx" ON "aiZahlungen" (auftrag_id);
CREATE INDEX IF NOT EXISTS "aiKundenAuftraege_sub_idx" ON "aiKundenAuftraege" (stripe_subscription_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ccc') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "aiStripeEreignisse", "aiKundenAuftraege", "aiZahlungen" TO ccc;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ccc;
  END IF;
END $$;

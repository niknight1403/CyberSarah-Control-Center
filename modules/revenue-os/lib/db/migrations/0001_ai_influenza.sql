-- Sprint 2 — AI Influenza Team: Geschäftsobjekte + Paket-Pläne
-- Idempotent. Ziel-DB: revenue_os. Nur additive Änderungen, keine Dropps.

-- 1) Kunden (Business-Entität über Leads hinaus)
CREATE TABLE IF NOT EXISTS kunden (
  id serial PRIMARY KEY,
  email varchar(320) NOT NULL UNIQUE,
  name varchar(255),
  firma varchar(255),
  telefon varchar(64),
  quelle varchar(64) NOT NULL DEFAULT 'inbound',
  status varchar(32) NOT NULL DEFAULT 'interessent',
  dsgvo_einwilligung timestamptz,
  notizen text,
  metadaten jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kunden_status_idx ON kunden (status);

-- 2) Angebote mit Freigabe-Gate
CREATE TABLE IF NOT EXISTS angebote (
  id serial PRIMARY KEY,
  kunde_id integer REFERENCES kunden(id) ON DELETE SET NULL,
  lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
  plan_id integer REFERENCES subscription_plans(id) ON DELETE SET NULL,
  paket varchar(32) NOT NULL,
  titel varchar(255) NOT NULL,
  leistungsumfang text NOT NULL,
  preis numeric(10,2) NOT NULL,
  waehrung varchar(3) NOT NULL DEFAULT 'EUR',
  intervall varchar(16) NOT NULL DEFAULT 'month',
  status varchar(32) NOT NULL DEFAULT 'entwurf',
  gueltig_bis timestamptz,
  freigegeben_von varchar(255),
  freigegeben_am timestamptz,
  erstellt_von varchar(64) NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS angebote_status_idx ON angebote (status);
CREATE INDEX IF NOT EXISTS angebote_kunde_idx ON angebote (kunde_id);

-- 3) Aufträge (Lieferung) mit Umsatz/Kosten-Trennung
CREATE TABLE IF NOT EXISTS auftraege (
  id serial PRIMARY KEY,
  angebot_id integer REFERENCES angebote(id) ON DELETE SET NULL,
  kunde_id integer REFERENCES kunden(id) ON DELETE SET NULL,
  subscription_id integer,
  paket varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'onboarding',
  fortschritt integer NOT NULL DEFAULT 0,
  start_am timestamptz NOT NULL DEFAULT now(),
  faellig_am timestamptz,
  abgeschlossen_am timestamptz,
  umsatz_cent integer NOT NULL DEFAULT 0,
  kosten_cent integer NOT NULL DEFAULT 0,
  zustaendiger_agent varchar(64) NOT NULL DEFAULT 'customer-success',
  ereignisse jsonb DEFAULT '[]',
  metadaten jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auftraege_status_idx ON auftraege (status);
CREATE INDEX IF NOT EXISTS auftraege_kunde_idx ON auftraege (kunde_id);

-- 4) Die drei AI-Influenza-Pakete als Abo-Pläne (Start-Hypothesen, ohne Stripe-IDs)
INSERT INTO subscription_plans (name, beschreibung, preis, waehrung, intervall, reihenfolge, aktiv, features, highlight_features, populaer)
SELECT * FROM (VALUES
  ('AI Influenza Starter', 'KI-Marketing-Einstieg: 12 Beiträge, 4 KI-Bilder, Content-Plan', 299.00, 'EUR', 'month', 100, true,
   '["12 Beiträge/Monat","4 KI-Bilder/Monat","Content-Plan"]'::jsonb, '[]'::jsonb, false),
  ('AI Influenza Growth', 'KI-Marketing mit Video: 12 Kurzvideos, 20 Beiträge, Monatsreport', 999.00, 'EUR', 'month', 101, true,
   '["12 Kurzvideos/Monat","20 Beiträge/Monat","Monatsreport"]'::jsonb, '[]'::jsonb, true),
  ('AI Influenza Business', 'Individuelles KI-Marketing-Team mit vereinbartem Leistungsumfang', 2499.00, 'EUR', 'month', 102, true,
   '["Individuelles Team","Vereinbarter Leistungsumfang","Wöchentliches Reporting"]'::jsonb, '[]'::jsonb, false)
) AS v(name, beschreibung, preis, waehrung, intervall, reihenfolge, aktiv, features, highlight_features, populaer)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans sp WHERE sp.name = v.name);

-- 5) DB-seitiges Freigabe-Gate: Versand nur mit dokumentierter Freigabe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'angebote_versand_gate') THEN
    ALTER TABLE angebote ADD CONSTRAINT angebote_versand_gate
      CHECK (status <> 'versendet' OR (freigegeben_am IS NOT NULL AND freigegeben_von IS NOT NULL));
  END IF;
END $$;

-- Sprint 3 — AI Influenza: Agenten-Registry, Aufgaben-Queue, Ereignis-Log.
-- Ziel-DB: cybersarah (App-DB). Idempotent, nur additiv.

CREATE TABLE IF NOT EXISTS "aiAgenten" (
  id serial PRIMARY KEY,
  typ varchar(64) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  rolle text NOT NULL,
  modus varchar(32) NOT NULL DEFAULT 'assisted',
  aktiv boolean NOT NULL DEFAULT true,
  ausgefuehrt_aufgaben integer NOT NULL DEFAULT 0,
  fehler_anzahl integer NOT NULL DEFAULT 0,
  letzte_aktivitaet timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "aiAufgaben" (
  id serial PRIMARY KEY,
  agent_typ varchar(64) NOT NULL,
  aufgabe_typ varchar(64) NOT NULL,
  titel varchar(255) NOT NULL,
  eingabe jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'queued',
  prioritaet integer NOT NULL DEFAULT 50,
  versuche integer NOT NULL DEFAULT 0,
  max_versuche integer NOT NULL DEFAULT 3,
  ergebnis text,
  fehler text,
  idempotenz_key varchar(160) NOT NULL UNIQUE,
  erfordert_freigabe boolean NOT NULL DEFAULT false,
  freigegeben_von varchar(255),
  freigegeben_am timestamptz,
  gestartet_am timestamptz,
  beendet_am timestamptz,
  dauer_ms integer,
  kosten_cent integer NOT NULL DEFAULT 0,
  erstellt_von varchar(64) NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "aiAufgaben_status_idx" ON "aiAufgaben" (status);
CREATE INDEX IF NOT EXISTS "aiAufgaben_agent_idx" ON "aiAufgaben" (agent_typ);

CREATE TABLE IF NOT EXISTS "aiAufgabenEreignisse" (
  id serial PRIMARY KEY,
  aufgabe_id integer NOT NULL REFERENCES "aiAufgaben"(id) ON DELETE CASCADE,
  von_status varchar(32),
  zu_status varchar(32) NOT NULL,
  agent_typ varchar(64),
  nachricht text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Die acht Rollen vorab anlegen (App initialisiert sie zusaetzlich idempotent).
INSERT INTO "aiAgenten" (typ, name, rolle) VALUES
  ('ceo', 'CEO & Business Orchestrator', 'Koordiniert Agenten, priorisiert rentable Aufgaben, kontrolliert Kosten, erstellt Geschäftsberichte.'),
  ('market_intelligence', 'Market Intelligence', 'Analysiert Nischen und Wettbewerber, identifiziert Kundenprobleme, entwickelt Dienstleistungsangebote.'),
  ('lead_discovery', 'Lead Discovery', 'Recherchiert öffentliche Geschäftskontakte, bewertet Zielunternehmen, achtet DSGVO.'),
  ('sales_conversion', 'Sales & Conversion', 'Erstellt Angebote und Landingpages, verwaltet Pipelines, bereitet zulässige Kontaktaufnahmen vor.'),
  ('content_production', 'Content Production', 'Erstellt Social-Beiträge, Content-Kalender und Kampagnen.'),
  ('video_creative', 'Video & Creative Studio', 'Generiert Skripte, Storyboards und Formate für Reels und Shorts.'),
  ('customer_success', 'Customer Success', 'Überwacht Aufträge, Liefertermine, Fortschrittsberichte und Kündigungsrisiken.'),
  ('profit_optimizer', 'Revenue & Profit Optimizer', 'Analysiert Umsätze, Deckungsbeiträge und API-Kosten, empfiehlt Preisoptimierungen.')
ON CONFLICT (typ) DO NOTHING;

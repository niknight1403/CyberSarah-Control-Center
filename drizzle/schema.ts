import {
  boolean,
  index,
  jsonb,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow (PostgreSQL / Neon).
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const userRole = pgEnum("user_role", ["user", "admin"]);

/** Sprint 71 — Persistente Modell-Router-Konfiguration (KV je Schluessel). */
export const modelRouterSettings = pgTable("modelRouterSettings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).unique(),
  role: userRole("role").default("user").notNull(),
  /** Persistente Design-Theme-Wahl (Sprint 160): synchronisiert mit
   * cybersarah.design-theme.v5 im Client. NULL = kein Profil-Override,
   * Client faellt auf lokalen Speicher / Default zurueck. */
  designTheme: varchar("designTheme", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const billingSubscriptions = pgTable("billingSubscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 })
    .notNull()
    .unique(),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  status: varchar("status", { length: 64 }).notNull(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Sprint 54 — persistierte Entwicklungsauftrags-Chat-Historie.
 * Nutzer-Bezug ueber openId (Sessions tragen openId, kein Join noetig);
 * role und content werden fuer den Prompt-Wiedereinsatz unverändert
 * gespeichert, provider zur Nachvollziehbarkeit.
 */
export const chatMessages = pgTable("chatMessages", {
  id: serial("id").primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().default("default"),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  provider: varchar("provider", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("chatMessages_session_idx").on(table.userOpenId, table.sessionId),
]);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type InsertBillingSubscription =
  typeof billingSubscriptions.$inferInsert;

/* ==================== Sprint 94 — Langzeit-Gedächtnis des Agenten ==================== */

/** Art des Lernings: Build-Optimierung, Fehlerbehebung, Interaktions- oder Entscheidungswissen. */
export const agentLearningKind = pgEnum("agent_learning_kind", [
  "build-optimierung",
  "fehlerbehebung",
  "interaktion",
  "entscheidung",
]);

/**
 * Langzeit-Gedächtnis: verdichtete Learnings aus vergangenen Turns —
 * Build-Optimierungen, Fehlerbehebungen und Interaktions-Learnings.
 * Wird beim Agent-Turn gegen den aktuellen Prompt gerankt und als
 * kompaktes Kontext-Snippet in den System-Prompt injiziert.
 */
export const agentLearnings = pgTable("agentLearnings", {
  id: serial("id").primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  kind: agentLearningKind("kind").notNull().default("interaktion"),
  title: varchar("title", { length: 160 }).notNull(),
  detail: text("detail").notNull(),
  keywords: varchar("keywords", { length: 400 }).notNull().default(""),
  sessionId: varchar("sessionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("agentLearnings_user_idx").on(table.userOpenId, table.createdAt),
]);

export type AgentLearning = typeof agentLearnings.$inferSelect;
export type InsertAgentLearning = typeof agentLearnings.$inferInsert;

/**
 * Sprint 162 — Vektor-Gedaechtnis: Einbettungen der Langzeit-Erinnerungen
 * (Learnings, Posting-Erfolge, Analytics-Notizen) als normalisierte
 * 256-dim-Vektoren. Storage bewusst als jsonb: die Tabelle laeuft auf jedem
 * Postgres/Neon ohne Erweiterung; sobald der Owner pgvector aktiviert,
 * kann dieselbe Spalte auf `vector(256)` umgestellt werden (Kosinus-Ranking
 * in SQL via <=>) — die Anwendungslogik (lib/vector-memory-logic.ts) bleibt
 * unveraendert, weil der Store-Vertrag identisch bleibt.
 */
export const agentMemoryVectors = pgTable("agentMemoryVectors", {
  id: serial("id").primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** Herkunft der Erinnerung (z. B. "agentLearning", "autoLearning", "posting"). */
  source: varchar("source", { length: 32 }).notNull().default("agentLearning"),
  /** Optionale Rueckreferenz (z. B. Learning-Id) fuer Nachvollziehbarkeit. */
  refId: varchar("refId", { length: 128 }),
  /** Rohtext der Erinnerung — Grundlage fuer Einbettung und Kontext. */
  text: text("text").notNull(),
  /** 256-dim L2-normalisierter Vektor (jsonb, pgvector-ready). */
  vector: jsonb("vector").notNull(),
  /** Frei verwendbare Metadaten (Quelle, Kategorie, ROI, ...). */
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("agentMemoryVectors_user_idx").on(table.userOpenId, table.createdAt),
]);

export type AgentMemoryVector = typeof agentMemoryVectors.$inferSelect;
export type InsertAgentMemoryVector = typeof agentMemoryVectors.$inferInsert;

/**
 * Sprint 113 — Memory-Konsolidierung: eine Zeile je Konsolidierungslauf
 * (naechtlicher Workflow oder Admin-Trigger). Traegt die Metriken des
 * Laufs und die aggregierten Retrieval-Metriken zum Laufzeitpunkt —
 * Grundlage der Admin-Sicht auf den Learning-Bestand.
 */
export const agentMemoryConsolidations = pgTable("agentMemoryConsolidations", {
  id: serial("id").primaryKey(),
  trigger: varchar("trigger", { length: 16 }).notNull().default("cron"),
  inputCount: integer("inputCount").notNull(),
  survivorCount: integer("survivorCount").notNull(),
  mergedAway: integer("mergedAway").notNull(),
  invalidated: integer("invalidated").notNull(),
  contradictionCount: integer("contradictionCount").notNull(),
  retrievalSamples: integer("retrievalSamples").notNull().default(0),
  retrievalHitRatePct: integer("retrievalHitRatePct").notNull().default(0),
  summary: text("summary").notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("agentMemoryConsolidations_created_idx").on(table.createdAt),
]);

export type AgentMemoryConsolidation = typeof agentMemoryConsolidations.$inferSelect;
export type InsertAgentMemoryConsolidation = typeof agentMemoryConsolidations.$inferInsert;

/* ==================== Sprint 132 — Projekte-Gedaechtnis ==================== */

/** Status eines vom Nutzer verfolgten Projekts (Repo, Sub-App, Vorhaben). */
export const projectStatus = pgEnum("project_status", [
  "idee",
  "in-arbeit",
  "pausiert",
  "live",
  "archiviert",
]);

/**
 * Dauerhaftes Gedaechtnis der laufenden Projekte eines Nutzers — taucht im
 * "Gedaechtnis"-Tab und als Kachel im Cyber-Dashboard auf, damit begonnene
 * Vorhaben (Repos, Sub-Apps) nicht mehr manuell nachgehalten werden muessen.
 */
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  repositoryUrl: varchar("repositoryUrl", { length: 300 }).notNull().default(""),
  status: projectStatus("status").notNull().default("in-arbeit"),
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("projects_user_idx").on(table.userOpenId, table.lastActivityAt),
]);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/* ==================== Sprint 137 — Mehrere Superagenten ==================== */

/** Lebenszyklus eines Superagenten: aktiv im Einsatz, pausiert oder archiviert (ausgeblendet, aber nicht geloescht). */
export const superAgentStatus = pgEnum("super_agent_status", [
  "aktiv",
  "pausiert",
  "archiviert",
]);

/**
 * Mehrere benannte Superagenten pro Nutzer — jeder mit eigener Aufgabe/Ziel
 * und eigenem, isoliertem Chatverlauf (sessionId verweist auf chatMessages.
 * sessionId, dessen Isolation bereits seit Sprint 57 besteht). Der
 * Default-Agent nutzt bewusst die feste sessionId "default", damit
 * bestehende Chatverlaeufe vor dieser Funktion erhalten bleiben.
 */
export const superAgents = pgTable("superAgents", {
  id: serial("id").primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  purpose: text("purpose").notNull().default(""),
  color: varchar("color", { length: 16 }).notNull().default("#FFB000"),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  status: superAgentStatus("status").notNull().default("aktiv"),
  isDefault: boolean("isDefault").notNull().default(false),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("superAgents_user_idx").on(table.userOpenId, table.lastActiveAt),
  index("superAgents_session_idx").on(table.userOpenId, table.sessionId),
]);

export type SuperAgentRow = typeof superAgents.$inferSelect;
export type InsertSuperAgentRow = typeof superAgents.$inferInsert;

/**
 * Sprint 346 — Autonome Draft-Engine: Freigabe-Queue (HITL).
 * Die Engine (Cron/admin) erzeugt NUR "pending"-Zeilen; "approved"/
 * "rejected" entscheidet ausschliesslich ein Mensch. Nichts wird ohne
 * Freigabe veroeffentlicht oder ausgefuehrt.
 */
export const draftKind = pgEnum("draft_kind", ["content", "revenue-loop", "idea"]);
export const draftStatus = pgEnum("draft_status", ["pending", "approved", "rejected"]);

export const draftQueue = pgTable("draftQueue", {
  id: serial("id").primaryKey(),
  kind: draftKind("kind").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: draftStatus("status").notNull().default("pending"),
  createdBy: varchar("createdBy", { length: 64 }).notNull().default("draft-engine"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: varchar("decidedBy", { length: 64 }),
}, (table) => [
  index("draftQueue_status_kind_idx").on(table.status, table.kind),
]);

export type DraftQueueRow = typeof draftQueue.$inferSelect;
export type InsertDraftQueueRow = typeof draftQueue.$inferInsert;

// Sprint 365 — Autonomes Social-Media-Publishing (Warteschlange je Nutzer).
// Kampagnen-Slots der 10 Influencer-Personas landen als Jobs hier; der
// Publishing-Autopilot verarbeitet faellige Eintraege autonom (live, wenn
// Plattform-Credentials vorhanden, sonst ehrlich im Sandbox-Modus).
// Tokens liegen NUR in Env-Variablen, niemals in der DB.
export const publishingStatus = pgEnum("publishing_status", [
  "geplant",
  "sandbox_veroeffentlicht",
  "veroeffentlicht",
  "fehlgeschlagen",
  "abgebrochen",
]);

export const publishingJobs = pgTable(
  "publishingJobs",
  {
    id: serial("id").primaryKey(),
    userOpenId: text("user_open_id").notNull(),
    product: text("product").notNull(),
    goal: text("goal").notNull(),
    persona: text("persona").notNull(),
    platform: text("platform").notNull(),
    campaignDay: integer("campaign_day").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: publishingStatus("status").notNull().default("geplant"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    mode: text("mode"),
    externalId: text("external_id"),
    assetUrl: text("asset_url"),
    assetUrls: jsonb("asset_urls").$type<string[]>().default([]).notNull(),
    insights: jsonb("insights").$type<Record<string, number>>().default({}).notNull(),
    insightsFetchedAt: timestamp("insights_fetched_at"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("publishing_jobs_queue_idx").on(table.userOpenId, table.status, table.scheduledFor),
    uniqueIndex("publishing_jobs_dedupe_idx").on(table.userOpenId, table.dedupeKey),
  ],
);


// Sprint 370 — Rotierte Plattform-Tokens (X-OAuth2-Auto-Refresh).
// X rotiert bei JEDEM Refresh den Access- UND Refresh-Token; die Umgebung
// liefert nur den Bootstrap-Satz. Der aktuell gueltige Tokensatz wird hier
// persistiert, damit der Autopilot den Live-Modus dauerhaft haelt.
export const platformTokens = pgTable(
  "platform_tokens",
  {
    id: serial("id").primaryKey(),
    platform: text("platform").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("platform_tokens_platform_idx").on(table.platform)],
);

export type PlatformTokenRow = typeof platformTokens.$inferSelect;
export type InsertPlatformTokenRow = typeof platformTokens.$inferInsert;

export type PublishingJobRow = typeof publishingJobs.$inferSelect;
export type InsertPublishingJobRow = typeof publishingJobs.$inferInsert;

/* ======================================================================
 * Phase 2 der Revenue-OS-Mission (2026-10-21): Digistore24-Affiliate-Kern.
 * Zero-Stub: echte Tabellen fuer Produktkatalog, Funnel-Kampagnen mit
 * Freigabe-Gate und idempotente Conversion-Events aus dem IPN-Webhook.
 * ==================================================================== */

/** Affiliate-Produkte aus Discovery/Scraping oder IPN-Auto-Discovery. */
export const affiliateProducts = pgTable("affiliate_products", {
  id: serial("id").primaryKey(),
  /** Eindeutige Produkt-Kennung der Plattform (Digistore24-Slug). */
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  /** Plattform-Herkunft (z. B. "digistore24"). */
  platform: varchar("platform", { length: 64 }).default("digistore24").notNull(),
  /** LLM-Bewertung 0-100 (Provision/Conversion/Nachfrage). */
  score: integer("score"),
  scoreReason: text("scoreReason"),
  /** Provision in Prozent, sofern bekannt (aus Discovery oder IPN). */
  commissionPercent: integer("commissionPercent"),
  /** EPC in Cent, sofern von der Plattform geliefert. */
  epcCents: integer("epcCents"),
  /** Aktive Verkaeufe aus IPN-Events (idempotent aggregiert). */
  conversionCount: integer("conversionCount").default(0).notNull(),
  revenueCents: integer("revenueCents").default(0).notNull(),
  discoveredAt: timestamp("discoveredAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Funnel-Kampagne mit HITL-Freigabe-Gate (awaiting_approval -> live). */
export const funnelCampaigns = pgTable("funnel_campaigns", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  hypothesis: text("hypothesis").notNull(),
  stages: jsonb("stages").notNull(),
  metric: varchar("metric", { length: 200 }).notNull(),
  /** awaiting_approval | live | paused | rejected */
  status: varchar("status", { length: 32 }).default("awaiting_approval").notNull(),
  /** Affiliate-Link inkl. Tracking-Parameter (nach Freigabe gesetzt). */
  affiliateUrl: varchar("affiliateUrl", { length: 800 }),
  /** Oeffentlicher Landing-Slug (nur live-Kampagnen werden ausgeliefert). */
  slug: varchar("slug", { length: 120 }).unique(),
  /** Vollstaendiger Funnel-Payload fuer die Landingpage-Renderung. */
  landingJson: jsonb("landingJson"),
  /** Landing-Aufrufe (Block 4 Performance-Tracking). */
  viewCount: integer("viewCount").default(0).notNull(),
  /** Klicks auf den Affiliate-CTA. */
  clickCount: integer("clickCount").default(0).notNull(),
  approvedAt: timestamp("approvedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Conversion-Events aus dem Digistore24-IPN (idempotent ueber orderKey). */
export const conversionEvents = pgTable("conversion_events", {
  id: serial("id").primaryKey(),
  /** Idempotenz-Schluessel: order_id + event-Typ. */
  orderKey: varchar("orderKey", { length: 200 }).notNull().unique(),
  productSlug: varchar("productSlug", { length: 200 }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  amountCents: integer("amountCents").default(0).notNull(),
  commissionCents: integer("commissionCents").default(0).notNull(),
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  buyerEmailHash: varchar("buyerEmailHash", { length: 128 }),
  rawPayload: jsonb("rawPayload"),
  occurredAt: timestamp("occurredAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Abo-Kennzahlen fuer das Wachstums-Dashboard (taeglich aggregiert). */
export const revenueDailyStats = pgTable("revenue_daily_stats", {
  id: serial("id").primaryKey(),
  day: varchar("day", { length: 10 }).notNull().unique(),
  clicks: integer("clicks").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),
  revenueCents: integer("revenueCents").default(0).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Sprint 3 (AI Influenza) — Agenten-Registry, Aufgaben-Queue, Ereignis-Log.
// Operativer Zustand in der App-DB (cybersarah); Geschaeftsobjekte
// (kunden/angebote/auftraege) liegen weiterhin in revenue_os.
// ---------------------------------------------------------------------------
export const aiAgenten = pgTable("aiAgenten", {
  id: serial("id").primaryKey(),
  typ: varchar("typ", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  rolle: text("rolle").notNull(),
  modus: varchar("modus", { length: 32 }).notNull().default("assisted"),
  aktiv: boolean("aktiv").notNull().default(true),
  ausgefuehrtAufgaben: integer("ausgefuehrt_aufgaben").notNull().default(0),
  fehlerAnzahl: integer("fehler_anzahl").notNull().default(0),
  letzteAktivitaet: timestamp("letzte_aktivitaet", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const aiAufgaben = pgTable("aiAufgaben", {
  id: serial("id").primaryKey(),
  agentTyp: varchar("agent_typ", { length: 64 }).notNull(),
  aufgabeTyp: varchar("aufgabe_typ", { length: 64 }).notNull(),
  titel: varchar("titel", { length: 255 }).notNull(),
  eingabe: jsonb("eingabe").notNull().default({}),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  prioritaet: integer("prioritaet").notNull().default(50),
  versuche: integer("versuche").notNull().default(0),
  maxVersuche: integer("max_versuche").notNull().default(3),
  ergebnis: text("ergebnis"),
  fehler: text("fehler"),
  idempotenzKey: varchar("idempotenz_key", { length: 160 }).notNull().unique(),
  erfordertFreigabe: boolean("erfordert_freigabe").notNull().default(false),
  freigegebenVon: varchar("freigegeben_von", { length: 255 }),
  freigegebenAm: timestamp("freigegeben_am", { withTimezone: true }),
  gestartetAm: timestamp("gestartet_am", { withTimezone: true }),
  beendetAm: timestamp("beendet_am", { withTimezone: true }),
  dauerMs: integer("dauer_ms"),
  kostenCent: integer("kosten_cent").notNull().default(0),
  erstelltVon: varchar("erstellt_von", { length: 64 }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("aiAufgaben_status_idx").on(table.status),
  index("aiAufgaben_agent_idx").on(table.agentTyp),
]);

export const aiAufgabenEreignisse = pgTable("aiAufgabenEreignisse", {
  id: serial("id").primaryKey(),
  aufgabeId: integer("aufgabe_id").notNull().references(() => aiAufgaben.id, { onDelete: "cascade" }),
  vonStatus: varchar("von_status", { length: 32 }),
  zuStatus: varchar("zu_status", { length: 32 }).notNull(),
  agentTyp: varchar("agent_typ", { length: 64 }),
  nachricht: text("nachricht"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiAgentRow = typeof aiAgenten.$inferSelect;
export type AiAufgabeRow = typeof aiAufgaben.$inferSelect;
export type AiAufgabeEreignisRow = typeof aiAufgabenEreignisse.$inferSelect;

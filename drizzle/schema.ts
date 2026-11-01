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
  /** Optional idempotency key for producers that can be invoked concurrently. */
  dedupeKey: varchar("dedupeKey", { length: 220 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: varchar("decidedBy", { length: 64 }),
}, (table) => [
  index("draftQueue_status_kind_idx").on(table.status, table.kind),
  uniqueIndex("draftQueue_dedupe_idx").on(table.dedupeKey),
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
  "in_bearbeitung",
  "versand_ungeklaert",
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


/** Append-only audit log for administrator decisions on uncertain social posts. */
export const publishingReviewEvents = pgTable("publishing_review_events", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  userOpenId: text("user_open_id").notNull(),
  actorOpenId: text("actor_open_id").notNull(),
  resolution: text("resolution").notNull(),
  evidence: text("evidence").notNull(),
  externalId: text("external_id"),
  reviewedAt: timestamp("reviewed_at", {withTimezone: true}).notNull().defaultNow(),
}, (table) => [
  index("publishing_review_events_owner_idx").on(table.userOpenId, table.reviewedAt),
  index("publishing_review_events_job_idx").on(table.jobId),
]);

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


/* Revenue Autopilot 2.0 — persistent, auditable operating state. */
export const revenueJobs = pgTable("revenue_jobs", {
  id: serial("id").primaryKey(),
  dedupeKey: varchar("dedupe_key", { length: 180 }).notNull().unique(),
  kind: varchar("kind", { length: 64 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  deferredUntil: timestamp("deferred_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("revenue_jobs_status_idx").on(table.status, table.createdAt)]);

export const revenueOffers = pgTable("revenue_offers", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(),
  name: varchar("name", { length: 220 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  priceCents: integer("price_cents"),
  marginPct: integer("margin_pct"),
  targetUrl: varchar("target_url", { length: 800 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("revenue_offers_status_idx").on(table.status, table.kind)]);

export const revenueExperiments = pgTable("revenue_experiments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 220 }).notNull(),
  dimension: varchar("dimension", { length: 32 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("learning"),
  variants: jsonb("variants").$type<Array<Record<string, unknown>>>().notNull(),
  decision: jsonb("decision").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const revenueAttributionEvents = pgTable("revenue_attribution_events", {
  id: serial("id").primaryKey(),
  eventKey: varchar("event_key", { length: 200 }).notNull().unique(),
  personaId: varchar("persona_id", { length: 40 }).notNull(),
  contentId: varchar("content_id", { length: 120 }).notNull(),
  platform: varchar("platform", { length: 40 }).notNull(),
  eventType: varchar("event_type", { length: 24 }).notNull(),
  valueCents: integer("value_cents").notNull().default(0),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("revenue_attr_content_idx").on(table.contentId, table.eventType),
  index("revenue_attr_persona_idx").on(table.personaId, table.occurredAt),
]);


export const revenueCostEvents = pgTable("revenue_cost_events", {
  id: serial("id").primaryKey(),
  eventKey: varchar("event_key", { length: 200 }).notNull().unique(),
  category: varchar("category", { length: 32 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("revenue_cost_category_idx").on(table.category, table.occurredAt)]);

export type RevenueCostEventRow = typeof revenueCostEvents.$inferSelect;

export type RevenueJobRow = typeof revenueJobs.$inferSelect;
export type RevenueOfferRow = typeof revenueOffers.$inferSelect;
export type RevenueExperimentRow = typeof revenueExperiments.$inferSelect;
export type RevenueAttributionEventRow = typeof revenueAttributionEvents.$inferSelect;

/** Agentforge event ledger: metadata only; prompts and model reasoning are excluded. */
export const agentforgeEvents = pgTable("agentforge_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id", { length: 120 }).notNull().unique(),
  eventType: varchar("event_type", { length: 48 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index("agentforge_events_type_idx").on(table.eventType, table.id)]);

export const agentforgeTaskStates = pgTable("agentforge_task_states", {
  taskId: varchar("task_id", { length: 120 }).primaryKey(),
  state: varchar("state", { length: 32 }).notNull(),
  agentId: varchar("agent_id", { length: 120 }),
  lastEventId: varchar("last_event_id", { length: 120 }).notNull(),
  errorCode: varchar("error_code", { length: 80 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("agentforge_tasks_state_idx").on(table.state, table.updatedAt)]);

export const agentforgeCheckpoints = pgTable("agentforge_checkpoints", {
  checkpointId: varchar("checkpoint_id", { length: 64 }).primaryKey(),
  taskId: varchar("task_id", { length: 120 }).notNull(),
  agentId: varchar("agent_id", { length: 120 }).notNull(),
  sequence: integer("sequence").notNull(),
  parentId: varchar("parent_id", { length: 64 }),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("agentforge_checkpoint_sequence_idx").on(table.taskId, table.agentId, table.sequence),
  index("agentforge_checkpoints_task_idx").on(table.taskId, table.agentId, table.sequence),
]);


/* ==================== B2B Growth Network + Influencer Learning ==================== */
export const b2bNetworkNodes = pgTable("b2b_network_nodes", {
  id: serial("id").primaryKey(),
  nodeKey: varchar("node_key", { length: 180 }).notNull().unique(),
  kind: varchar("kind", { length: 24 }).notNull(),
  name: varchar("name", { length: 220 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  fit: integer("fit").notNull().default(0),
  intent: integer("intent").notNull().default(0),
  trust: integer("trust").notNull().default(0),
  relationshipStrength: integer("relationship_strength").notNull().default(0),
  estimatedValueCents: integer("estimated_value_cents"),
  optedOut: boolean("opted_out").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("b2b_network_kind_idx").on(table.kind, table.updatedAt),
  index("b2b_network_activity_idx").on(table.lastActivityAt),
]);

export const b2bNetworkEdges = pgTable("b2b_network_edges", {
  id: serial("id").primaryKey(),
  edgeKey: varchar("edge_key", { length: 220 }).notNull().unique(),
  fromNodeKey: varchar("from_node_key", { length: 180 }).notNull(),
  toNodeKey: varchar("to_node_key", { length: 180 }).notNull(),
  relation: varchar("relation", { length: 40 }).notNull(),
  stage: varchar("stage", { length: 32 }).notNull().default("discovered"),
  strength: integer("strength").notNull().default(0),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("b2b_edges_from_idx").on(table.fromNodeKey, table.stage),
  index("b2b_edges_to_idx").on(table.toNodeKey, table.stage),
]);

export const influencerLearningStates = pgTable("influencer_learning_states", {
  id: serial("id").primaryKey(),
  personaId: varchar("persona_id", { length: 40 }).notNull().unique(),
  version: integer("version").notNull().default(1),
  observations: integer("observations").notNull().default(0),
  score: integer("score").notNull().default(0),
  platformWeights: jsonb("platform_weights").$type<Record<string, number>>().default({}).notNull(),
  pillarWeights: jsonb("pillar_weights").$type<Record<string, number>>().default({}).notNull(),
  nextExperiments: jsonb("next_experiments").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  learnedAt: timestamp("learned_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("influencer_learning_score_idx").on(table.score, table.updatedAt)]);

/**
 * Sprint 30 — Append-only Freigabe-Ereignisse des Admin-Produktkatalogs.
 * Nur serverseitige Admin-Prozeduren schreiben; keine Stripe-Schreibzugriffe.
 */
export const productReleaseEvents = pgTable("product_release_events", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  mode: text("mode").notNull(),
  action: text("action").notNull(),
  verdict: text("verdict").notNull(),
  actorOpenId: text("actor_open_id").notNull(),
  issuesSnapshot: jsonb("issues_snapshot").$type<string[]>().default([]).notNull(),
  note: text("note"),
  catalogComplete: boolean("catalog_complete").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("product_release_events_product_idx").on(table.productId, table.createdAt),
  index("product_release_events_actor_idx").on(table.actorOpenId, table.createdAt),
]);

export type ProductReleaseEventRow = typeof productReleaseEvents.$inferSelect;

export type B2BNetworkNodeRow = typeof b2bNetworkNodes.$inferSelect;
export type B2BNetworkEdgeRow = typeof b2bNetworkEdges.$inferSelect;
export type InfluencerLearningStateRow = typeof influencerLearningStates.$inferSelect;

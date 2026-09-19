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

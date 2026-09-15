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

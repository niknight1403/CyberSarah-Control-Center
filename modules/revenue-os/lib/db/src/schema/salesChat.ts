import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesConversationsTable = pgTable("sales_conversations", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  kundenEmail: varchar("kunden_email", { length: 255 }),
  kundenName: varchar("kunden_name", { length: 255 }),
  quelle: varchar("quelle", { length: 32 }).notNull().default("chat"), // "chat" | "whatsapp" | "widget"
  seite: varchar("seite", { length: 255 }), // Auf welcher Seite der Chat gestartet wurde
  nachrichten: jsonb("nachrichten").notNull().default('[]'),
  stimmung: varchar("stimmung", { length: 32 }), // "positiv" | "neutral" | "negativ" | "interessiert"
  empfohlenesProdukt: varchar("empfohlenes_produkt", { length: 255 }),
  checkoutLink: text("checkout_link"),
  couponCode: varchar("coupon_code", { length: 32 }),
  konvertiert: boolean("konvertiert").default(false),
  transaktionsId: varchar("transaktions_id", { length: 255 }),
  umsatz: numeric("umsatz", { precision: 10, scale: 2 }),
  notizen: text("notizen"),
  bewertung: integer("bewertung"), // 1-5 Sterne
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesChatLeadsTable = pgTable("sales_chat_leads", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  conversationId: integer("conversation_id").references(() => salesConversationsTable.id),
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 255 }),
  telefon: varchar("telefon", { length: 32 }),
  interesse: varchar("interesse", { length: 255 }),
  budget: varchar("budget", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("neu"), // "neu" | "kontaktiert" | "qualifiziert" | "abgeschlossen"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalesConversationSchema = createInsertSchema(salesConversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSalesChatLeadSchema = createInsertSchema(salesChatLeadsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type SalesConversation = typeof salesConversationsTable.$inferSelect;
export type SalesChatLead = typeof salesChatLeadsTable.$inferSelect;

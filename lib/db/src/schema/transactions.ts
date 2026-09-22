import { pgTable, serial, text, timestamp, varchar, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  transaktionsId: varchar("transaktions_id", { length: 255 }).unique(),
  quelle: varchar("quelle", { length: 64 }).notNull(),
  typ: varchar("typ", { length: 64 }).notNull(),
  betrag: numeric("betrag", { precision: 12, scale: 2 }).notNull(),
  waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
  beschreibung: text("beschreibung"),
  produktName: varchar("produkt_name", { length: 255 }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).unique(),
  metadaten: text("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

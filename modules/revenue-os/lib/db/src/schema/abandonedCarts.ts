import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const abandonedCartsTable = pgTable("abandoned_carts", {
  id: serial("id").primaryKey(),
  kundenEmail: varchar("kunden_email", { length: 255 }),
  kundenTelefon: varchar("kunden_telefon", { length: 32 }),
  kundenName: varchar("kunden_name", { length: 255 }),
  produkte: text("produkte").notNull(), // JSON: [{name, preis, menge}]
  gesamtbetrag: numeric("gesamtbetrag", { precision: 12, scale: 2 }).notNull(),
  waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
  quelle: varchar("quelle", { length: 64 }).notNull(), // "stripe" | "shop" | "api" | "manual"
  stripeSessionId: varchar("stripe_session_id", { length: 255 }).unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("neu"), // "neu" | "erinnert_1" | "erinnert_2" | "coupon_gesendet" | "wiederhergestellt" | "verloren"
  erinnerungsKanaele: text("erinnerungs_kanaele").default("[]"), // JSON: ["email", "push", "whatsapp"]
  couponId: integer("coupon_id"),
  wiederhergestelltAm: timestamp("wiederhergestellt_am", { withTimezone: true }),
  wiederhergestelltTransaktion: varchar("wiederhergestellt_transaktion", { length: 255 }),
  notizen: text("notizen"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAbandonedCartSchema = createInsertSchema(abandonedCartsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAbandonedCart = z.infer<typeof insertAbandonedCartSchema>;
export type AbandonedCart = typeof abandonedCartsTable.$inferSelect;

import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  beschreibung: text("beschreibung"),
  preis: numeric("preis", { precision: 10, scale: 2 }).notNull(),
  waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
  intervall: varchar("intervall", { length: 16 }).notNull(), // "month" | "year" | "week"
  trialTage: integer("trial_tage").notNull().default(0),
  stripePreisId: varchar("stripe_preis_id", { length: 255 }).unique(),
  stripeProduktId: varchar("stripe_produkt_id", { length: 255 }),
  features: jsonb("features").default('[]'), // ["Feature 1", "Feature 2"]
  highlightFeatures: jsonb("highlight_features").default('[]'), // Besonders hervorgehoben
  populär: boolean("populaer").default(false),
  reihenfolge: integer("reihenfolge").notNull().default(0),
  aktiv: boolean("aktiv").notNull().default(true),
  maxAboCount: integer("max_abo_count"), // 0 = unbegrenzt, null = unbegrenzt
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerSubscriptionsTable = pgTable("customer_subscriptions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id).notNull(),
  kundenEmail: varchar("kunden_email", { length: 255 }).notNull(),
  kundenName: varchar("kunden_name", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("aktiv"),
  // "aktiv" | "pausiert" | "ausstehend" | "fehlgeschlagen" | "gekuendigt" | "abgelaufen"
  aktuellerPeriodStart: timestamp("aktueller_period_start", { withTimezone: true }),
  aktuellerPeriodEnde: timestamp("aktueller_period_ende", { withTimezone: true }),
  trialEnde: timestamp("trial_ende", { withTimezone: true }),
  letzteRechnung: timestamp("letzte_rechnung", { withTimezone: true }),
  fehlgeschlageneZahlungen: integer("fehlgeschlagene_zahlungen").notNull().default(0),
  letzterFehlgeschlagen: timestamp("letzter_fehlgeschlagen", { withTimezone: true }),
  gekuendigtAm: timestamp("gekuendigt_am", { withTimezone: true }),
  grundKündigung: text("grund_kuendigung"),
  couponId: integer("coupon_id"),
  metadaten: jsonb("metadaten").default('{}'),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionInvoicesTable = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => customerSubscriptionsTable.id).notNull(),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }).unique(),
  stripeRechnungUrl: text("stripe_rechnung_url"),
  betrag: numeric("betrag", { precision: 10, scale: 2 }).notNull(),
  waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
  status: varchar("status", { length: 32 }).notNull().default("offen"), // "offen" | "bezahlt" | "fehlgeschlagen" | "storniert"
  zahlungsversuch: integer("zahlungsversuch").notNull().default(1),
  bezahltAm: timestamp("bezahlt_am", { withTimezone: true }),
  fallbackVersendet: boolean("fallback_versendet").default(false), // Dunning-Email wurde gesendet
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCustomerSubscriptionSchema = createInsertSchema(customerSubscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionInvoiceSchema = createInsertSchema(subscriptionInvoicesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type CustomerSubscription = typeof customerSubscriptionsTable.$inferSelect;
export type SubscriptionInvoice = typeof subscriptionInvoicesTable.$inferSelect;

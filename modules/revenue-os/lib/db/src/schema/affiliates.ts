import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const affiliatePartnersTable = pgTable("affiliate_partners", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  telefon: varchar("telefon", { length: 32 }),
  website: text("website"),
  notizen: text("notizen"),
  status: varchar("status", { length: 32 }).notNull().default("aktiv"), // "aktiv" | "inaktiv" | "gekündigt"
  stufe: varchar("stufe", { length: 32 }).notNull().default("bronze"), // "bronze" | "silber" | "gold" | "platin"
  provisionProzentsatz: numeric("provision_prozentsatz", { precision: 5, scale: 2 }).notNull().default("10"),
  cookieTage: integer("cookie_tage").notNull().default(30),
  gesamtUmsatz: numeric("gesamt_umsatz", { precision: 12, scale: 2 }).notNull().default("0"),
  gesamtProvision: numeric("gesamt_provision", { precision: 12, scale: 2 }).notNull().default("0"),
  ausstehendProvision: numeric("ausstehend_provision", { precision: 12, scale: 2 }).notNull().default("0"),
  ausgezahltProvision: numeric("ausgezahlt_provision", { precision: 12, scale: 2 }).notNull().default("0"),
  klickAnzahl: integer("klick_anzahl").notNull().default(0),
  konversionAnzahl: integer("konversion_anzahl").notNull().default(0),
  paypalEmail: varchar("paypal_email", { length: 255 }),
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  auszahlungsIntervall: varchar("auszahlungs_intervall", { length: 32 }).default("monatlich"),
  minAuszahlung: numeric("min_auszahlung", { precision: 10, scale: 2 }).notNull().default("20"),
  zugestimmteAGB: boolean("zugestimmte_agb").default(false),
  letzteAktivitaet: timestamp("letzte_aktivitaet", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliateLinksTable = pgTable("affiliate_links", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => affiliatePartnersTable.id).notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  zielUrl: text("ziel_url").notNull(),
  produktName: varchar("produkt_name", { length: 255 }),
  kategorie: varchar("kategorie", { length: 64 }),
  provisionAbweichend: numeric("provision_abweichend", { precision: 5, scale: 2 }),
  klickAnzahl: integer("klick_anzahl").notNull().default(0),
  konversionAnzahl: integer("konversion_anzahl").notNull().default(0),
  aktiv: boolean("aktiv").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliateClicksTable = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").references(() => affiliateLinksTable.id),
  partnerId: integer("partner_id").references(() => affiliatePartnersTable.id).notNull(),
  ipAdresse: varchar("ip_adresse", { length: 45 }),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  zielUrl: text("ziel_url"),
  konvertiert: boolean("konvertiert").default(false),
  transaktionsId: varchar("transaktions_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliatePayoutsTable = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => affiliatePartnersTable.id).notNull(),
  betrag: numeric("betrag", { precision: 10, scale: 2 }).notNull(),
  waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
  status: varchar("status", { length: 32 }).notNull().default("ausstehend"), // "ausstehend" | "bezahlt" | "storniert" | "fehlgeschlagen"
  methode: varchar("methode", { length: 32 }), // "paypal" | "stripe" | "bank" | "gutschrift"
  referenzId: varchar("referenz_id", { length: 255 }),
  notizen: text("notizen"),
  bezahltAm: timestamp("bezahlt_am", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAffiliatePartnerSchema = createInsertSchema(affiliatePartnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateLinkSchema = createInsertSchema(affiliateLinksTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateClickSchema = createInsertSchema(affiliateClicksTable).omit({ id: true, createdAt: true });
export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayoutsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type AffiliatePartner = typeof affiliatePartnersTable.$inferSelect;
export type AffiliateLink = typeof affiliateLinksTable.$inferSelect;
export type AffiliateClick = typeof affiliateClicksTable.$inferSelect;
export type AffiliatePayout = typeof affiliatePayoutsTable.$inferSelect;

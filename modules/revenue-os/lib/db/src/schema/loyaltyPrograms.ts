import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loyaltyProgramsTable = pgTable("loyalty_programs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  beschreibung: text("beschreibung"),
  stufen: jsonb("stufen").notNull().default('[]'), // [{name, minPunkte, multiplier, badge}]
  punkteProEuro: numeric("punkte_pro_euro", { precision: 6, scale: 2 }).notNull().default("1"),
  willkommensPunkte: integer("willkommens_punkte").notNull().default(100),
  geburtstagsPunkte: integer("geburtstags_punkte").notNull().default(200),
  aktiv: boolean("aktiv").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyCardsTable = pgTable("loyalty_cards", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loyaltyProgramsTable.id).notNull(),
  kundenEmail: varchar("kunden_email", { length: 255 }),
  kundenTelefon: varchar("kunden_telefon", { length: 32 }),
  punkte: integer("punkte").notNull().default(0),
  umsatzGesamt: numeric("umsatz_gesamt", { precision: 12, scale: 2 }).notNull().default("0"),
  transaktionsAnzahl: integer("transaktions_anzahl").notNull().default(0),
  stufe: varchar("stufe", { length: 64 }).notNull().default("bronze"),
  geburtsdatum: timestamp("geburtsdatum", { withTimezone: true }),
  letzteTransaktion: timestamp("letzte_transaktion", { withTimezone: true }),
  aktiv: boolean("aktiv").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").references(() => loyaltyCardsTable.id).notNull(),
  typ: varchar("typ", { length: 32 }).notNull(), // "gutschrift" | "einzug" | "bonus" | "geburtstag" | "willkommen" | "ablauf"
  punkte: integer("punkte").notNull(),
  grund: text("grund"),
  transaktionsId: varchar("transaktions_id", { length: 255 }),
  couponId: integer("coupon_id"),
  verfallDatum: timestamp("verfall_datum", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  werberEmail: varchar("werber_email", { length: 255 }),
  werberTelefon: varchar("werber_telefon", { length: 32 }),
  geworbenerEmail: varchar("geworbener_email", { length: 255 }),
  geworbenerName: varchar("geworbener_name", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("offen"), // "offen" | "registriert" | "erster_kauf" | "praemie_gewaehrt" | "abgelaufen"
  belohnungTyp: varchar("belohnung_typ", { length: 32 }), // "punkte" | "coupon" | "rabatt"
  belohnungWert: varchar("belohnung_wert", { length: 64 }),
  couponId: integer("coupon_id"),
  praemieGewaehrt: boolean("praemie_gewehrt").default(false),
  notizen: text("notizen"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLoyaltyProgramSchema = createInsertSchema(loyaltyProgramsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoyaltyCardSchema = createInsertSchema(loyaltyCardsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactionsTable).omit({ id: true, createdAt: true });
export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type LoyaltyProgram = typeof loyaltyProgramsTable.$inferSelect;
export type LoyaltyCard = typeof loyaltyCardsTable.$inferSelect;
export type LoyaltyTransaction = typeof loyaltyTransactionsTable.$inferSelect;
export type Referral = typeof referralsTable.$inferSelect;

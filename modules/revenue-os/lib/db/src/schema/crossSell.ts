import { pgTable, serial, text, varchar, integer, boolean, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-SELL RULES — Produkt A → Produkt B Empfehlungen
// ═══════════════════════════════════════════════════════════════════════════════
export const crossSellRulesTable = pgTable("cross_sell_rules", {
  id: serial("id").primaryKey(),
  quellProdukt: varchar("quell_produkt", { length: 255 }).notNull(),
  zielProdukt: varchar("ziel_produkt", { length: 255 }).notNull(),
  regelTyp: varchar("regel_typ", { length: 64 }).notNull().default("ki_generiert"),
  // "ki_generiert" | "manuell" | "automatisch" | "seasonal"
  wahrscheinlichkeit: numeric("wahrscheinlichkeit", { precision: 5, scale: 2 }).default("0.00"),
  // Wie wahrscheinlich ist der Cross-Sell (0.00 - 1.00)
  konversionsRate: numeric("konversions_rate", { precision: 5, scale: 2 }).default("0.00"),
  anzahlEmpfohlen: integer("anzahl_empfohlen").notNull().default(0),
  anzahlKonvertiert: integer("anzahl_konvertiert").notNull().default(0),
  rabattProzent: integer("rabatt_prozent").default(0),
  // Optionaler Rabatt auf das Zielprodukt bei Cross-Sell
  kategorie: varchar("kategorie", { length: 64 }),
  // "upsell" | "cross_sell" | "bundle" | "addon"
  aktiv: boolean("aktiv").notNull().default(true),
  metadaten: jsonb("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-SELL RECOMMENDATIONS — Personalisierte Empfehlungen pro Kunde
// ═══════════════════════════════════════════════════════════════════════════════
export const crossSellRecommendationsTable = pgTable("cross_sell_recommendations", {
  id: serial("id").primaryKey(),
  kundenEmail: varchar("kunden_email", { length: 320 }).notNull(),
  ruleId: integer("rule_id").references(() => crossSellRulesTable.id),
  quellProdukt: varchar("quell_produkt", { length: 255 }).notNull(),
  zielProdukt: varchar("ziel_produkt", { length: 255 }).notNull(),
  kategorie: varchar("kategorie", { length: 64 }).default("cross_sell"),
  rabattProzent: integer("rabatt_prozent").default(0),
  status: varchar("status", { length: 64 }).notNull().default("ausstehend"),
  // "ausstehend" | "gesendet" | "geklickt" | "konvertiert" | "abgelaufen"
  campaignId: integer("campaign_id"),
  gesendetAm: timestamp("gesendet_am", { withTimezone: true }),
  geklicktAm: timestamp("geklickt_am", { withTimezone: true }),
  konvertiertAm: timestamp("konvertiert_am", { withTimezone: true }),
  kanal: varchar("kanal", { length: 64 }).default("email"),
  // "email" | "push" | "in_app" | "whatsapp"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-SELL CAMPAIGNS — Multi-Channel Kampagnen-Tracking
// ═══════════════════════════════════════════════════════════════════════════════
export const crossSellCampaignsTable = pgTable("cross_sell_campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  beschreibung: text("beschreibung"),
  typ: varchar("typ", { length: 64 }).notNull().default("automated"),
  // "automated" | "manual" | "ai_generated"
  kanaele: jsonb("kanaele").notNull().default(["email"]),
  // ["email"], ["push"], ["email", "push"], ["email", "push", "in_app"]
  zielProdukte: jsonb("ziel_produkte"),
  // Liste der Zielprodukte oder null für alle
  regelnAnzahl: integer("regeln_anzahl").notNull().default(0),
  empfehlungenGesendet: integer("empfehlungen_gesendet").notNull().default(0),
  empfehlungenGeklickt: integer("empfehlungen_geklickt").notNull().default(0),
  empfehlungenKonvertiert: integer("empfehlungen_konvertiert").notNull().default(0),
  umsatzGeneriert: numeric("umsatz_generiert", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 64 }).notNull().default("aktiv"),
  // "aktiv" | "pausiert" | "beendet" | "entwurf"
  startedAm: timestamp("started_am", { withTimezone: true }),
  endedAm: timestamp("ended_am", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCrossSellRuleSchema = createInsertSchema(crossSellRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrossSellRule = z.infer<typeof insertCrossSellRuleSchema>;
export type CrossSellRule = typeof crossSellRulesTable.$inferSelect;

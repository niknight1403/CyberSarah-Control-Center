import { pgTable, serial, text, varchar, integer, boolean, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ═══════════════════════════════════════════════════════════════════════════════
// A/B-TEST CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════
export const abTestCampaignsTable = pgTable("ab_test_campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  beschreibung: text("beschreibung"),
  testTyp: varchar("test_typ", { length: 64 }).notNull(),
  // "price" | "headline" | "cta" | "content" | "landingpage" | "email_subject" | "email_body" | "button_color"
  zielElement: varchar("ziel_element", { length: 255 }).notNull(),
  // Was wird getestet? (z.B. "preis_starter", "produkt_headline", "email_cta_button")
  kanal: varchar("kanal", { length: 64 }).notNull().default("all"),
  // "email" | "push" | "in_app" | "social" | "landingpage" | "all"
  status: varchar("status", { length: 64 }).notNull().default("entwurf"),
  // "entwurf" | "aktiv" | "pausiert" | "abgeschlossen" | "abgebrochen"
  varianteAInhalt: jsonb("variante_a_inhalt"),
  varianteBInhalt: jsonb("variante_b_inhalt"),
  // Die konkreten Inhalte der Varianten (Preis, Text, Farbe, etc.)
  varianteAGewichtung: integer("variante_a_gewichtung").notNull().default(50),
  varianteBGewichtung: integer("variante_b_gewichtung").notNull().default(50),
  mindestStichprobe: integer("mindest_stichprobe").notNull().default(100),
  // Minimale Besucher/Klicks für signifikantes Ergebnis
  konfidenzNiveau: numeric("konfidenz_niveau", { precision: 4, scale: 2 }).default("0.95"),
  // Statistisches Konfidenzniveau (0.95 = 95%)
  gewinner: varchar("gewinner", { length: 16 }),
  // "a" | "b" | "keiner" | null
  verbesserungProzent: numeric("verbesserung_prozent", { precision: 8, scale: 2 }),
  // Um wieviel Prozent besser ist der Gewinner?
  autoApply: boolean("auto_apply").notNull().default(false),
  // Soll der Gewinner automatisch übernommen werden?
  autoAppliedAm: timestamp("auto_applied_am", { withTimezone: true }),
  gestartetAm: timestamp("gestartet_am", { withTimezone: true }),
  beendetAm: timestamp("beendet_am", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// A/B-TEST RESULTS — Einzelergebnisse pro Variante
// ═══════════════════════════════════════════════════════════════════════════════
export const abTestResultsTable = pgTable("ab_test_results", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => abTestCampaignsTable.id),
  variante: varchar("variante", { length: 16 }).notNull(),
  // "a" | "b"
  impressions: integer("impressions").notNull().default(0),
  // Wie oft wurde die Variante gezeigt?
  klicks: integer("klicks").notNull().default(0),
  // Wie oft wurde geklickt?
  conversions: integer("conversions").notNull().default(0),
  // Wie oft wurde konvertiert (Kauf, Anmeldung, etc.)?
  umsatz: numeric("umsatz", { precision: 12, scale: 2 }).default("0.00"),
  konversionsRate: numeric("konversions_rate", { precision: 8, scale: 4 }).default("0.0000"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// A/B-TEST EVENTS — Einzelne Events für detaillierte Analyse
// ═══════════════════════════════════════════════════════════════════════════════
export const abTestEventsTable = pgTable("ab_test_events", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => abTestCampaignsTable.id),
  variante: varchar("variante", { length: 16 }).notNull(),
  eventTyp: varchar("event_typ", { length: 64 }).notNull(),
  // "impression" | "click" | "conversion"
  kundenIdent: varchar("kunden_ident", { length: 320 }),
  // Email oder ID des Kunden (für deduplizierte Zählung)
  metadaten: jsonb("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIERUNGS-VORSCHLÄGE — KI-generierte Optimierungs-Ideen
// ═══════════════════════════════════════════════════════════════════════════════
export const optimizationSuggestionsTable = pgTable("optimization_suggestions", {
  id: serial("id").primaryKey(),
  typ: varchar("typ", { length: 64 }).notNull(),
  // "price_change" | "headline_change" | "cta_change" | "new_test" | "seasonal"
  ziel: varchar("ziel", { length: 255 }).notNull(),
  // Was soll optimiert werden?
  aktuellerWert: text("aktueller_wert"),
  vorgeschlagenerWert: text("vorgeschlagener_wert"),
  erwarteteVerbesserung: varchar("erwartete_verbesserung", { length: 64 }),
  begruendung: text("begruendung"),
  prioritaet: integer("prioritaet").notNull().default(5),
  // 1-10 (10 = höchste Priorität)
  status: varchar("status", { length: 64 }).notNull().default("offen"),
  // "offen" | "in_test" | "umgesetzt" | "abgelehnt"
  testCampaignId: integer("test_campaign_id").references(() => abTestCampaignsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAbTestSchema = createInsertSchema(abTestCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAbTest = z.infer<typeof insertAbTestSchema>;
export type AbTestCampaign = typeof abTestCampaignsTable.$inferSelect;

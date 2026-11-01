/**
 * Sprint 2 — AI Influenza Team: Geschäftsobjekte (Kunden, Angebote, Aufträge).
 *
 * Zweck: Der Kundenprozess aus Phase 7 braucht nachvollziehbare Objekte
 * (Marktanalyse → Lead → Angebot → Vertrag/Zahlung → Auftrag → Lieferung).
 * Bestehende Tabellen (leads, subscription_plans, customer_subscriptions,
 * revenue_checkout_intakes) bleiben unangetastet und werden referenziert.
 *
 * Konventionen: deutsche snake_case-Spalten wie im restlichen Revenue-OS.
 */
import { pgTable, serial, text, varchar, integer, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";
import { subscriptionPlansTable } from "./subscriptions";

/** Kunden bzw. Interessenten (Business-Entität über den Lead hinaus). */
export const kundenTable = pgTable(
  "kunden",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    firma: varchar("firma", { length: 255 }),
    telefon: varchar("telefon", { length: 64 }),
    quelle: varchar("quelle", { length: 64 }).notNull().default("inbound"), // inbound | empfehlung | outbound
    status: varchar("status", { length: 32 }).notNull().default("interessent"), // interessent | kunde | gekuendigt
    dsgvo_einwilligung: timestamp("dsgvo_einwilligung", { withTimezone: true }),
    notizen: text("notizen"),
    metadaten: jsonb("metadaten").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("kunden_status_idx").on(table.status),
  }),
);

/** Angebote mit Preis und Freigabe-Gate (externe Aktion benötigt Freigabe). */
export const angeboteTable = pgTable(
  "angebote",
  {
    id: serial("id").primaryKey(),
    kundeId: integer("kunde_id").references(() => kundenTable.id, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    planId: integer("plan_id").references(() => subscriptionPlansTable.id, { onDelete: "set null" }),
    paket: varchar("paket", { length: 32 }).notNull(), // starter | growth | business
    titel: varchar("titel", { length: 255 }).notNull(),
    leistungsumfang: text("leistungsumfang").notNull(),
    preis: numeric("preis", { precision: 10, scale: 2 }).notNull(),
    waehrung: varchar("waehrung", { length: 3 }).notNull().default("EUR"),
    intervall: varchar("intervall", { length: 16 }).notNull().default("month"),
    status: varchar("status", { length: 32 }).notNull().default("entwurf"),
    // entwurf | freigabe_offen | freigegeben | versendet | angenommen | abgelehnt | abgelaufen
    gueltig_bis: timestamp("gueltig_bis", { withTimezone: true }),
    freigegeben_von: varchar("freigegeben_von", { length: 255 }),
    freigegeben_am: timestamp("freigegeben_am", { withTimezone: true }),
    erstellt_von: varchar("erstellt_von", { length: 64 }).notNull().default("agent"), // agent | admin
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("angebote_status_idx").on(table.status),
    kundeIdx: index("angebote_kunde_idx").on(table.kundeId),
  }),
);

/** Aufträge (Lieferung) mit Status, Frist und Kosten/Umsatz-Trennung. */
export const auftraegeTable = pgTable(
  "auftraege",
  {
    id: serial("id").primaryKey(),
    angebotId: integer("angebot_id").references(() => angeboteTable.id, { onDelete: "set null" }),
    kundeId: integer("kunde_id").references(() => kundenTable.id, { onDelete: "set null" }),
    subscriptionId: integer("subscription_id"),
    paket: varchar("paket", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("onboarding"),
    // onboarding | produktion | qualitaetspruefung | kundenfreigabe | ausgeliefert | abgebrochen
    fortschritt: integer("fortschritt").notNull().default(0), // 0..100
    start_am: timestamp("start_am", { withTimezone: true }).notNull().defaultNow(),
    faellig_am: timestamp("faellig_am", { withTimezone: true }),
    abgeschlossen_am: timestamp("abgeschlossen_am", { withTimezone: true }),
    umsatz_cent: integer("umsatz_cent").notNull().default(0),
    kosten_cent: integer("kosten_cent").notNull().default(0),
    zustaendiger_agent: varchar("zustaendiger_agent", { length: 64 }).notNull().default("customer-success"),
    ereignisse: jsonb("ereignisse").default("[]"), // [{ zeit, status, agent, notiz }]
    metadaten: jsonb("metadaten").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("auftraege_status_idx").on(table.status),
    kundeIdx: index("auftraege_kunde_idx").on(table.kundeId),
  }),
);

export type Kunde = typeof kundenTable.$inferSelect;
export type Angebot = typeof angeboteTable.$inferSelect;
export type Auftrag = typeof auftraegeTable.$inferSelect;

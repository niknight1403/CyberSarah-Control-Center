import { pgTable, serial, text, decimal, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const expansionChancenTable = pgTable("expansion_chancen", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung").notNull(),
  kategorie: text("kategorie").notNull(), // "affiliate" | "eigenes_produkt" | "abo" | "coaching" | "freelance" | "content"
  plattform: text("plattform"),           // Digistore24, TikTok, YouTube, Stripe, Etsy...
  kosten: decimal("kosten", { precision: 10, scale: 2 }).default("0"),       // €0 = kostenlos
  geschaetzterUmsatz: decimal("geschaetzter_umsatz", { precision: 10, scale: 2 }).default("0"),
  roi: decimal("roi", { precision: 8, scale: 2 }).default("0"),              // ROI % (>200% = sicher)
  kostenlos: boolean("kostenlos").default(true),                              // Kein Einsatz nötig
  sofortStartbar: boolean("sofort_startbar").default(false),                  // Sofort ohne Vorbereitung
  prioritaet: integer("prioritaet").default(3),                              // 1=hoch, 2=mittel, 3=niedrig
  status: text("status").notNull().default("entdeckt"),                      // entdeckt | aktiv | getestet | pausiert
  aktionsUrl: text("aktions_url"),                                           // Anmelde-/Affiliate-Link
  zeitBisErstemUmsatz: text("zeit_bis_erstem_umsatz"),                      // "sofort" | "1-7 Tage" | "1-4 Wochen"
  monatlichesWachstumPotenzial: text("monatliches_wachstum_potenzial"),      // "gering" | "mittel" | "hoch" | "viral"
  entdecktVon: text("entdeckt_von").default("expansion_scanner"),
  validiert: boolean("validiert").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

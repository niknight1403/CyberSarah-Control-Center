import { pgTable, serial, text, decimal, integer, timestamp } from "drizzle-orm/pg-core";

export const revenueOpportunitiesTable = pgTable("revenue_opportunities", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  kanal: text("kanal").notNull(),
  marke: text("marke"),
  status: text("status").notNull().default("entdeckt"),
  geschaetzterMonatsumsatz: decimal("geschaetzter_monatsumsatz", { precision: 10, scale: 2 }).default("0"),
  tatsaechlicherUmsatz: decimal("tatsaechlicher_umsatz", { precision: 10, scale: 2 }).default("0"),
  konversionsrate: decimal("konversionsrate", { precision: 5, scale: 2 }).default("0"),
  stripePaymentLink: text("stripe_payment_link"),
  affiliateUrl: text("affiliate_url"),
  prioritaet: integer("prioritaet").default(3),
  gefundenVon: text("gefunden_von").default("revenue_analyst"),
  metadaten: text("metadaten"),
  // ─── Finance-Team / Registrierungs-Workflow ──────────────────────────────
  registrierungsStatus: text("registrierungs_status").default("offen"),
  registrierungsLink: text("registrierungs_link"),
  registrierungsAnleitung: text("registrierungs_anleitung"),
  teamBewertung: text("team_bewertung"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

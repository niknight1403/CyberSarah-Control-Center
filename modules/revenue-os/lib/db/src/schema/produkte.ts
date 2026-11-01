import { pgTable, serial, text, decimal, boolean, timestamp } from "drizzle-orm/pg-core";

export const produkteTable = pgTable("produkte", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  beschreibung: text("beschreibung"),
  preis: decimal("preis", { precision: 10, scale: 2 }).notNull(),
  kategorie: text("kategorie").notNull(), // "prompt_paket" | "coaching" | "kurs" | "template"
  stripeProduktId: text("stripe_produkt_id"),
  stripePreisId: text("stripe_preis_id"),
  stripePaymentLink: text("stripe_payment_link"),
  gumroadUrl: text("gumroad_url"),
  inhalt: text("inhalt"),                  // generierter Produktinhalt (JSON)
  aktiv: boolean("aktiv").default(false),
  verkauft: decimal("verkauft", { precision: 10, scale: 2 }).default("0"),
  verkaeufeAnzahl: text("verkaeufe_anzahl").default("0"),
  pausiertAm: timestamp("pausiert_am"),
  quelle: text("quelle"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const setupSchritteTable = pgTable("setup_schritte", {
  id: serial("id").primaryKey(),
  schluessel: text("schluessel").notNull().unique(), // "gumroad" | "digistore24" | "stripe_produkte" | "coaching"
  name: text("name").notNull(),
  erledigt: boolean("erledigt").default(false),
  metadaten: text("metadaten"),            // JSON: URLs, IDs etc.
  erledigtAm: timestamp("erledigt_am"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

import { pgTable, serial, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const emailSequenzenTable = pgTable("email_sequenzen", {
  id: serial("id").primaryKey(),
  marke: varchar("marke", { length: 64 }).notNull(),
  leadMagnet: varchar("lead_magnet", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  emails: jsonb("emails").notNull(), // Array<{ betreff, inhalt, tagNachAnmeldung }>
  produktId: integer("produkt_id"), // verweist auf produkteTable — Monetarisierungs-Ziel
  aktiv: boolean("aktiv").notNull().default(true),
  klicks: integer("klicks").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  marke: varchar("marke", { length: 64 }).notNull(),
  quelle: varchar("quelle", { length: 255 }), // z.B. Lead-Magnet oder Formular-Herkunft
  sequenzId: integer("sequenz_id"),
  aktuellerSchritt: integer("aktueller_schritt").notNull().default(0),
  status: varchar("status", { length: 64 }).notNull().default("aktiv"), // "aktiv" | "abgemeldet"
  letzteEmailAm: timestamp("letzte_email_am", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

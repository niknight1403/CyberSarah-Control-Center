import { pgTable, serial, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const seoContentTable = pgTable("seo_content", {
  id: serial("id").primaryKey(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  titel: varchar("titel", { length: 500 }).notNull(),
  metaDescription: varchar("meta_description", { length: 320 }),
  body: text("body").notNull(), // Markdown-formatierter Artikel-Inhalt
  marke: varchar("marke", { length: 64 }).notNull(),
  produktId: integer("produkt_id"), // verweist auf produkteTable — Monetarisierung im Artikel
  status: varchar("status", { length: 64 }).notNull().default("veroeffentlicht"), // "veroeffentlicht" | "pausiert"
  aufrufe: integer("aufrufe").notNull().default(0),
  veroeffentlichtAm: timestamp("veroeffentlicht_am", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

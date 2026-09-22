import { pgTable, serial, text, timestamp, varchar, boolean, integer } from "drizzle-orm/pg-core";
import { contentTable } from "./content";

export const influencerPlatformenTable = pgTable("influencer_plattformen", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  anzeigeName: varchar("anzeige_name", { length: 128 }).notNull(),
  symbol: varchar("symbol", { length: 8 }).notNull().default("📱"),
  webhookUrl: text("webhook_url"),
  aktiv: boolean("aktiv").notNull().default(false),
  postingsProTag: integer("postings_pro_tag").notNull().default(3),
  besteZeiten: varchar("beste_zeiten", { length: 256 }).notNull().default("08:00,13:00,19:00"),
  postingsHeute: integer("postings_heute").notNull().default(0),
  postingsGesamt: integer("postings_gesamt").notNull().default(0),
  letzterPost: timestamp("letzter_post", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const influencerPostingsTable = pgTable("influencer_postings", {
  id: serial("id").primaryKey(),
  contentId: integer("content_id").references(() => contentTable.id),
  plattform: varchar("plattform", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("ausstehend"),
  inhaltKurz: text("inhalt_kurz"),
  webhookResponse: text("webhook_response"),
  gepostetAm: timestamp("gepostet_am", { withTimezone: true }),
  fehler: text("fehler"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InfluencerPlattform = typeof influencerPlatformenTable.$inferSelect;
export type InfluencerPosting = typeof influencerPostingsTable.$inferSelect;

import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const contentTable = pgTable("content", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaignsTable.id),
  marke: varchar("marke", { length: 64 }).notNull(),
  typ: varchar("typ", { length: 64 }).notNull(),
  plattform: varchar("plattform", { length: 64 }).notNull(),
  titel: varchar("titel", { length: 500 }).notNull(),
  inhalt: text("inhalt"),
  bildUrl: text("bild_url"),
  status: varchar("status", { length: 64 }).notNull().default("entwurf"),
  veroeffentlichtAm: timestamp("veroeffentlicht_am", { withTimezone: true }),
  metadaten: text("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContentSchema = createInsertSchema(contentTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contentTable.$inferSelect;

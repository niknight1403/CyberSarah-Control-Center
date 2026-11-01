import { pgTable, serial, text, timestamp, varchar, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contentTable } from "./content";

export const contentRecyclingTable = pgTable("content_recycling", {
  id: serial("id").primaryKey(),
  quelleTyp: varchar("quelle_typ", { length: 32 }).notNull(), // "seo_content" | "content"
  quelleId: integer("quelle_id").notNull(),
  quelleTitel: varchar("quelle_titel", { length: 500 }).notNull(),
  quelleAufrufe: integer("quelle_aufrufe").notNull().default(0),
  neuerContentId: integer("neuer_content_id").references(() => contentTable.id),
  marke: varchar("marke", { length: 64 }).notNull(),
  neuePlattform: varchar("neue_plattform", { length: 64 }).notNull(),
  neuerTyp: varchar("neuer_typ", { length: 64 }).notNull(),
  begruendung: text("begruendung"),
  status: varchar("status", { length: 32 }).notNull().default("recycelt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // verhindert doppeltes Recycling derselben Quelle, auch bei parallelen Cron-/Manuell-Triggern
  uniqueIndex("content_recycling_quelle_unique").on(table.quelleTyp, table.quelleId),
]);

export const insertContentRecyclingSchema = createInsertSchema(contentRecyclingTable).omit({ id: true, createdAt: true });
export type InsertContentRecycling = z.infer<typeof insertContentRecyclingSchema>;
export type ContentRecycling = typeof contentRecyclingTable.$inferSelect;

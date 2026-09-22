import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const facelessVideosTable = pgTable("faceless_videos", {
  id: serial("id").primaryKey(),
  marke: varchar("marke", { length: 64 }).notNull(),
  plattform: varchar("plattform", { length: 64 }).notNull(),
  thema: varchar("thema", { length: 500 }).notNull(),
  hook: text("hook"),
  voiceoverSkript: text("voiceover_skript"),
  callToAction: text("call_to_action"),
  thumbnailPrompt: text("thumbnail_prompt"),
  thumbnailUrl: text("thumbnail_url"),
  status: varchar("status", { length: 32 }).notNull().default("entwurf"),
  veroeffentlichtAm: timestamp("veroeffentlicht_am", { withTimezone: true }),
  webhookResponse: text("webhook_response"),
  aufrufe: integer("aufrufe").notNull().default(0),
  klicks: integer("klicks").notNull().default(0),
  performanceScore: integer("performance_score").notNull().default(0),
  analysiert: integer("analysiert").notNull().default(0),
  quelle: varchar("quelle", { length: 32 }).notNull().default("openai"),
  metadaten: text("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFacelessVideoSchema = createInsertSchema(facelessVideosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFacelessVideo = z.infer<typeof insertFacelessVideoSchema>;
export type FacelessVideo = typeof facelessVideosTable.$inferSelect;

import { pgTable, serial, text, timestamp, varchar, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  marke: varchar("marke", { length: 64 }).notNull(),
  typ: varchar("typ", { length: 64 }).notNull(),
  kategorie: varchar("kategorie", { length: 64 }),
  netzwerk: varchar("netzwerk", { length: 64 }).default("keins"),
  status: varchar("status", { length: 64 }).notNull().default("aktiv"),
  affiliateLink: text("affiliate_link"),
  provision: numeric("provision", { precision: 10, scale: 2 }),
  klicks: integer("klicks").notNull().default(0),
  konversionen: integer("konversionen").notNull().default(0),
  umsatz: numeric("umsatz", { precision: 12, scale: 2 }).notNull().default("0"),
  startDatum: timestamp("start_datum", { withTimezone: true }),
  endDatum: timestamp("end_datum", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;

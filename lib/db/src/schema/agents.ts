import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  typ: varchar("typ", { length: 64 }).notNull(),
  status: varchar("status", { length: 64 }).notNull().default("wartend"),
  beschreibung: text("beschreibung"),
  letzteAktivitaet: timestamp("letzte_aktivitaet", { withTimezone: true }),
  fehlerAnzahl: integer("fehler_anzahl").notNull().default(0),
  ausgefuehrtAufgaben: integer("ausgefuehrt_aufgaben").notNull().default(0),
  konfiguration: text("konfiguration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;

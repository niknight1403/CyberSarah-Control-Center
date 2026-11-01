import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  externalId: varchar("external_id", { length: 255 }).unique(),
  email: varchar("email", { length: 320 }).unique(),
  name: text("name"),
  rolle: varchar("rolle", { length: 64 }).notNull().default("admin"),
  /** Scrypt-Hash (Format: scrypt$<salt>$<hash>) — niemals Klartext */
  passwortHash: text("passwort_hash"),
  /** Berechtigungs-Matrix als JSON: ["*"] = Administrator mit allen Rechten */
  berechtigungen: text("berechtigungen"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

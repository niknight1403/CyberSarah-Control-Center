import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Kurzlebige Zuordnungstabelle: hält die Content-Attribution (client_reference_id)
 * zwischen `checkout.session.completed` und dem eigentlichen Buchungs-Event
 * (`payment_intent.succeeded` / `invoice.paid`) fest, da Stripe die Zahlung
 * erst dort final bestätigt. Zeilen werden nach Verwendung gelöscht bzw.
 * opportunistisch nach 48h aufgeräumt.
 */
export const pendingAttributionTable = pgTable("pending_attribution", {
  id: serial("id").primaryKey(),
  referenceKey: varchar("reference_key", { length: 255 }).unique().notNull(),
  attributionTyp: varchar("attribution_typ", { length: 32 }).notNull(),
  attributionId: integer("attribution_id").notNull(),
  attributionLabel: varchar("attribution_label", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPendingAttributionSchema = createInsertSchema(pendingAttributionTable).omit({ id: true, createdAt: true });
export type InsertPendingAttribution = z.infer<typeof insertPendingAttributionSchema>;
export type PendingAttribution = typeof pendingAttributionTable.$inferSelect;

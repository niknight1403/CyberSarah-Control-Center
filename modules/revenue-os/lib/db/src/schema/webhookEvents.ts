import { pgTable, serial, text, timestamp, varchar, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * webhookEvents — Vollständiges Audit-Log für alle eingehenden Webhooks.
 * Jeder Stripe-Webhook und jede Digistore24-IPN wird hier protokolliert,
 * unabhängig davon, ob die Verarbeitung erfolgreich war.
 */
export const webhookEventsTable = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  quelle: varchar("quelle", { length: 32 }).notNull(),         // "stripe" | "digistore24" | "sonstiges"
  ereignisTyp: varchar("ereignis_typ", { length: 128 }),        // z.B. "checkout.session.completed"
  externId: varchar("extern_id", { length: 255 }),              // Stripe event.id oder DS24 order_id
  payload: jsonb("payload"),                                    // Rohes Webhook-Payload (JSON)
  signaturPruefung: boolean("signatur_pruefung").default(false), // true = Signatur validiert
  signaturGueltig: boolean("signatur_gueltig"),                 // true = gültig, false = ungültig, null = nicht geprüft
  verarbeitet: boolean("verarbeitet").default(false),           // true = erfolgreich verbucht
  fehler: text("fehler"),                                       // Fehlermeldung bei Verarbeitungsfehler
  ipAdresse: varchar("ip_adresse", { length: 64 }),            // IP des Senders
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEventsTable)
  .omit({ id: true, createdAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;

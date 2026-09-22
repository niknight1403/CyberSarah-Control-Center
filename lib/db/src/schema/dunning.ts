import { pgTable, serial, varchar, timestamp, unique } from "drizzle-orm/pg-core";

export const dunningEmailsTable = pgTable("dunning_emails", {
  id: serial("id").primaryKey(),
  ereignisTyp: varchar("ereignis_typ", { length: 32 }).notNull(), // "zahlung_fehlgeschlagen" | "abo_gekuendigt"
  referenzId: varchar("referenz_id", { length: 255 }).notNull(), // Invoice- oder Subscription-ID
  email: varchar("email", { length: 320 }).notNull(),
  versendet: varchar("versendet", { length: 8 }).notNull().default("ja"), // "ja" | "nein" (kein Webhook konfiguriert)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("dunning_emails_typ_referenz_unique").on(t.ereignisTyp, t.referenzId),
]);

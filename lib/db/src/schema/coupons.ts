import { pgTable, serial, text, varchar, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  typ: varchar("typ", { length: 32 }).notNull().default("prozent"), // "prozent" | "fix" | "gratis_versand"
  wert: numeric("wert", { precision: 10, scale: 2 }).notNull(), // Prozent oder Fixbetrag
  mindestbestellwert: numeric("mindestbestellwert", { precision: 10, scale: 2 }).default("0"),
  maxUses: integer("max_uses").default(1), // 0 = unbegrenzt
  uses: integer("uses").notNull().default(0),
  giltFuerProdukte: text("gilt_fuer_produkte"), // JSON-Array von Produkt-IDs oder "all"
  giltFuerKunden: text("gilt_fuer_kunden"),    // JSON-Array von Kunden-IDs oder "all"
  aktiv: boolean("aktiv").notNull().default(true),
  startDatum: timestamp("start_datum", { withTimezone: true }).notNull().defaultNow(),
  endDatum: timestamp("end_datum", { withTimezone: true }),
  erstelltVon: varchar("erstellt_von", { length: 64 }).default("system"), // "system" | "agent" | "admin"
  kiGeneriert: boolean("ki_generiert").default(false),
  kiBegruendung: text("ki_begruendung"), // Warum dieser Coupon? (KI-Log)
  metadaten: text("metadaten"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponUsesTable = pgTable("coupon_uses", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").references(() => couponsTable.id).notNull(),
  transaktionsId: varchar("transaktions_id", { length: 255 }),
  kundenEmail: varchar("kunden_email", { length: 255 }),
  kundenTelefon: varchar("kunden_telefon", { length: 32 }),
  betragOriginal: numeric("betrag_original", { precision: 10, scale: 2 }).notNull(),
  betragRabatt: numeric("betrag_rabatt", { precision: 10, scale: 2 }).notNull(),
  betragEndgueltig: numeric("betrag_endgueltig", { precision: 10, scale: 2 }).notNull(),
  konvertiert: boolean("konvertiert").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({ id: true, uses: true, createdAt: true, updatedAt: true });
export const insertCouponUseSchema = createInsertSchema(couponUsesTable).omit({ id: true, createdAt: true });
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
export type CouponUse = typeof couponUsesTable.$inferSelect;

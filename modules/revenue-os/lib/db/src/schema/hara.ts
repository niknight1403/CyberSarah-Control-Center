import { pgTable, serial, text, decimal, integer, timestamp } from "drizzle-orm/pg-core";

// HARA — Hyper-Autonomer Revenue Agent
// Vorschläge (Revenue-Pakete) mit strukturiertem Automatisierungs-Pfad.
// Statuskette: vorgeschlagen → bestaetigt → in_umsetzung → abgeschlossen (oder verworfen)
export const haraProposalsTable = pgTable("hara_proposals", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  status: text("status").notNull().default("vorgeschlagen"),
  marke: text("marke"),
  kanal: text("kanal").notNull(),
  businessCase: text("business_case").notNull(),
  roiErwartung: text("roi_erwartung").notNull(),
  geschaetzterMonatsumsatz: decimal("geschaetzter_monatsumsatz", { precision: 10, scale: 2 }).default("0"),
  // JSON-Array von Strings: benötigte APIs, Tools, Budget
  ressourcen: text("ressourcen").notNull().default("[]"),
  // JSON-Array von Schritten: { beschreibung, typ: "auto_content"|"auto_kampagne"|"manuell", status: "offen"|"erledigt", ergebnis? }
  automatisierungsPfad: text("automatisierungs_pfad").notNull().default("[]"),
  roiScore: integer("roi_score").notNull().default(0),
  geschwindigkeitScore: integer("geschwindigkeit_score").notNull().default(0),
  automatisierbarkeitScore: integer("automatisierbarkeit_score").notNull().default(0),
  gesamtScore: integer("gesamt_score").notNull().default(0),
  quelle: text("quelle").notNull().default("hara_ki"),
  bestaetigtAm: timestamp("bestaetigt_am"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Self-Optimization-Loop: jedes abgeschlossene/verworfene Paket hinterlässt
// einen Lern-Eintrag, der beim nächsten Scan als Kontext-Wissen eingelesen wird.
export const haraPerformanceTable = pgTable("hara_performance", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id"),
  titel: text("titel").notNull(),
  kanal: text("kanal"),
  resultat: text("resultat").notNull(), // "erfolg" | "misserfolg" | "verworfen"
  analyse: text("analyse").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

import { pgTable, serial, text, decimal, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const tradingPortfolioTable = pgTable("trading_portfolio", {
  id: serial("id").primaryKey(),
  basisKapital: decimal("basis_kapital", { precision: 15, scale: 2 }).default("10000.00"),
  kassenbestand: decimal("kassenbestand", { precision: 15, scale: 2 }).default("10000.00"),
  gesamtwert: decimal("gesamtwert", { precision: 15, scale: 2 }).default("10000.00"),
  gesamtPnL: decimal("gesamt_pnl", { precision: 15, scale: 2 }).default("0.00"),
  gesamtPnLProzent: decimal("gesamt_pnl_prozent", { precision: 10, scale: 4 }).default("0.0000"),
  tagesGewinn: decimal("tages_gewinn", { precision: 15, scale: 2 }).default("0.00"),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00"),
  gesamtTrades: integer("gesamt_trades").default(0),
  gewinnTrades: integer("gewinn_trades").default(0),
  verlustTrades: integer("verlust_trades").default(0),
  aktuellePositionen: text("aktuelle_positionen"),   // JSON: [{symbol, menge, einstiegspreis, aktuellKurs}]
  letzteAktualisierung: timestamp("letzte_aktualisierung").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tradingOrdersTable = pgTable("trading_orders", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),        // "BTC", "ETH", "SOL"
  richtung: text("richtung").notNull(),    // "KAUF" | "VERKAUF"
  menge: decimal("menge", { precision: 20, scale: 8 }).notNull(),
  preis: decimal("preis", { precision: 15, scale: 2 }).notNull(),
  gesamt: decimal("gesamt", { precision: 15, scale: 2 }).notNull(),
  gebuehr: decimal("gebuehr", { precision: 10, scale: 4 }).default("0.0000"),
  pnl: decimal("pnl", { precision: 15, scale: 2 }),
  pnlProzent: decimal("pnl_prozent", { precision: 10, scale: 4 }),
  grund: text("grund"),                    // KI-Begründung für die Order
  strategyVersion: integer("strategy_version").default(1),
  erfolgreich: boolean("erfolgreich").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tradingStrategieTable = pgTable("trading_strategie", {
  id: serial("id").primaryKey(),
  version: integer("version").default(1).notNull(),
  aktiv: boolean("aktiv").default(true),
  name: text("name").default("CyberSarah Micro-Trader v1"),
  risikoLevel: text("risiko_level").default("mittel"),     // niedrig | mittel | hoch
  maxPositionProzent: decimal("max_position_prozent", { precision: 5, scale: 2 }).default("20.00"),
  stoplossRegel: decimal("stoploss_regel", { precision: 5, scale: 2 }).default("5.00"),
  takeProfitRegel: decimal("take_profit_regel", { precision: 5, scale: 2 }).default("10.00"),
  praeferierteAssets: text("praefeierte_assets").default('["BTC","ETH","SOL","BNB","ADA"]'),
  systemPrompt: text("system_prompt"),                     // Evolviertes AI-Prompt
  optimierungsHinweise: text("optimierungs_hinweise"),     // JSON: Erkenntnisse aus Vergangenheit
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00"),
  gesamtPnL: decimal("gesamt_pnl", { precision: 15, scale: 2 }).default("0.00"),
  optimierungszaehler: integer("optimierungszaehler").default(0),
  letzteOptimierung: timestamp("letzte_optimierung"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tradingSignaleTable = pgTable("trading_signale", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),        // "STARK_KAUF" | "KAUF" | "HALTEN" | "VERKAUF" | "STARK_VERKAUF"
  konfidenz: decimal("konfidenz", { precision: 5, scale: 2 }),
  analyse: text("analyse"),               // KI-Analyse-Text
  preis: decimal("preis", { precision: 15, scale: 2 }),
  ausgefuehrt: boolean("ausgefuehrt").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

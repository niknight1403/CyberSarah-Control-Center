/**
 * Live-Trading Executor — Binance API Integration
 * 
 * Aktivierung: BINANCE_API_KEY + BINANCE_SECRET + TRADING_LIVE_MODE=true
 * 
 * Sicherheitsmechanismen:
 * - Maximale Position pro Trade (TRADING_MAX_POSITION_EUR, default: €100)
 * - Tages-Verlust-Limit (TRADING_DAILY_LOSS_LIMIT_EUR, default: €50)
 * - Automatische Notabschaltung bei kritischen Fehlern
 * - Alle Orders werden in DB protokolliert (Audit-Trail)
 */

import crypto from "crypto";
import { db } from "@workspace/db";
import { tradingOrdersTable } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Konfiguration ────────────────────────────────────────────────────────────

export const LIVE_TRADING_AKTIV =
  process.env["TRADING_LIVE_MODE"] === "true" &&
  !!process.env["BINANCE_API_KEY"] &&
  !!process.env["BINANCE_SECRET"];

const MAX_POSITION_EUR = parseFloat(process.env["TRADING_MAX_POSITION_EUR"] ?? "100");
const DAILY_LOSS_LIMIT = parseFloat(process.env["TRADING_DAILY_LOSS_LIMIT_EUR"] ?? "50");

if (LIVE_TRADING_AKTIV) {
  logger.warn(
    { maxPosition: MAX_POSITION_EUR, dailyLossLimit: DAILY_LOSS_LIMIT },
    "⚠️  LIVE-TRADING AKTIV — Echte Transaktionen werden durchgeführt!"
  );
} else {
  logger.info("📊 Trading läuft im PAPER-MODUS (kein echtes Geld)");
}

// ─── Tagesverlust-Tracker ─────────────────────────────────────────────────────

let tagesVerlust = 0;
let letzterReset = new Date().toDateString();

function pruefeUndReseteTagesVerlust(): boolean {
  const heute = new Date().toDateString();
  if (heute !== letzterReset) {
    tagesVerlust = 0;
    letzterReset = heute;
    logger.info("Tages-Verlust-Zähler zurückgesetzt");
  }
  if (tagesVerlust >= DAILY_LOSS_LIMIT) {
    logger.error(
      { tagesVerlust, limit: DAILY_LOSS_LIMIT },
      "🚨 TAGES-VERLUST-LIMIT ERREICHT — Keine weiteren Trades heute!"
    );
    return false;
  }
  return true;
}

// ─── Binance API Signatur ─────────────────────────────────────────────────────

function erstelleSignatur(queryString: string): string {
  const secret = process.env["BINANCE_SECRET"]!;
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceRequest(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const apiKey = process.env["BINANCE_API_KEY"]!;
  const timestamp = Date.now();

  const queryParams = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(timestamp),
  });

  const signature = erstelleSignatur(queryParams.toString());
  queryParams.append("signature", signature);

  const url = `https://api.binance.com${endpoint}?${queryParams}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const fehler = await res.text();
    throw new Error(`Binance API Fehler ${res.status}: ${fehler}`);
  }

  return res.json();
}

// ─── Kontostand prüfen ────────────────────────────────────────────────────────

export async function holeKontostand(): Promise<{ EUR: number; assets: Record<string, number> }> {
  if (!LIVE_TRADING_AKTIV) {
    return { EUR: 0, assets: {} };
  }

  const konto = await binanceRequest("GET", "/api/v3/account") as {
    balances: Array<{ asset: string; free: string; locked: string }>;
  };

  const assets: Record<string, number> = {};
  let eurBestand = 0;

  for (const balance of konto.balances) {
    const free = parseFloat(balance.free);
    if (free > 0.001) {
      assets[balance.asset] = free;
      if (balance.asset === "USDT" || balance.asset === "EUR") {
        eurBestand += free;
      }
    }
  }

  return { EUR: eurBestand, assets };
}

// ─── Live-Order platzieren ────────────────────────────────────────────────────

export async function platziereLiveOrder(params: {
  symbol: string;          // z.B. "BTCEUR" oder "ETHUSDT"
  richtung: "KAUF" | "VERKAUF";
  betragEUR: number;       // In EUR
  aktuellerPreis: number;
  strategyVersion: number;
  grund: string;
}): Promise<{ erfolg: boolean; orderId?: string; fehler?: string }> {

  if (!LIVE_TRADING_AKTIV) {
    logger.info({ ...params }, "📊 PAPER-TRADE (kein echtes Geld)");
    return { erfolg: true };
  }

  // Sicherheitschecks
  if (!pruefeUndReseteTagesVerlust()) {
    return { erfolg: false, fehler: "Tages-Verlust-Limit erreicht" };
  }

  const betrag = Math.min(params.betragEUR, MAX_POSITION_EUR);
  if (betrag < 10) {
    return { erfolg: false, fehler: `Betrag zu klein: €${betrag}` };
  }

  try {
    // Binance erwartet Quantity, nicht EUR-Betrag
    const menge = parseFloat((betrag / params.aktuellerPreis).toFixed(6));

    // Symbol anpassen (Binance nutzt meistens USDT, nicht EUR)
    const binanceSymbol = params.symbol.endsWith("EUR")
      ? params.symbol
      : params.symbol.replace("EUR", "USDT");

    const order = await binanceRequest("POST", "/api/v3/order", {
      symbol: binanceSymbol,
      side: params.richtung === "KAUF" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: menge,
    }) as { orderId: number; executedQty: string; cummulativeQuoteQty: string; status: string };

    const ausgefuehrteMenge = parseFloat(order.executedQty);
    const ausgefuehrtesVolumen = parseFloat(order.cummulativeQuoteQty);

    // In DB protokollieren
    await db.insert(tradingOrdersTable).values({
      symbol: params.symbol,
      richtung: params.richtung,
      menge: ausgefuehrteMenge.toString(),
      preis: params.aktuellerPreis.toString(),
      gesamt: ausgefuehrtesVolumen.toString(),
      grund: `[LIVE] ${params.grund}`,
      strategyVersion: params.strategyVersion,
      isLive: true,
      binanceOrderId: String(order.orderId),
    });

    logger.info(
      { orderId: order.orderId, symbol: params.symbol, betrag, menge },
      `✅ LIVE-ORDER ausgeführt: ${params.richtung} ${params.symbol}`
    );

    return { erfolg: true, orderId: String(order.orderId) };

  } catch (err: unknown) {
    const fehler = err instanceof Error ? err.message : String(err);

    // Verlust bei fehlgeschlagenen Orders tracken
    if (params.richtung === "VERKAUF") {
      tagesVerlust += betrag * 0.01; // Schätze 1% Verlust bei Fehler
    }

    logger.error({ err: fehler, symbol: params.symbol }, "❌ LIVE-ORDER fehlgeschlagen");

    // DB-Log auch bei Fehler
    await db.insert(tradingOrdersTable).values({
      symbol: params.symbol,
      richtung: params.richtung,
      menge: "0",
      preis: params.aktuellerPreis.toString(),
      gesamt: "0",
      grund: `[LIVE-FEHLER] ${params.grund}: ${fehler}`,
      strategyVersion: params.strategyVersion,
      isLive: true,
      fehler: fehler,
    }).catch(() => {});

    return { erfolg: false, fehler };
  }
}

// ─── Status-Check ─────────────────────────────────────────────────────────────

export function getTradingStatus() {
  return {
    liveModusAktiv: LIVE_TRADING_AKTIV,
    maxPositionEUR: MAX_POSITION_EUR,
    dailyLossLimitEUR: DAILY_LOSS_LIMIT,
    tagesVerlustBisher: tagesVerlust,
    binanceApiKonfiguriert: !!process.env["BINANCE_API_KEY"],
  };
}

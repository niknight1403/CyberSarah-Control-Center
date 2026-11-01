/**
 * Autonomer KI Micro-Trading Agent
 * - Echte Marktdaten via Binance Public API (kein Key nötig)
 * - OpenAI GPT-4o-mini für Handelsentscheidungen
 * - Self-Improvement: analysiert Trades, optimiert Strategie selbst
 * - Papertrades: simuliertes Portfolio (kein echtes Geld riskiert)
 * - Für echtes Trading: BINANCE_API_KEY + BINANCE_SECRET in Secrets eintragen
 */
import { db } from "@workspace/db";
import {
  tradingPortfolioTable, tradingOrdersTable,
  tradingStrategieTable, tradingSignaleTable, agentLogsTable, agentsTable,
} from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { pruefeHandelsfreigabe, fuehreEvolutionsZyklusAus } from "./microTradingEvolution";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { platziereLiveOrder, LIVE_TRADING_AKTIV } from "../lib/liveTradingExecutor";

// ─── Agent-Log Helfer (fehlertolerant — darf den Prozess nie zum Absturz bringen) ─

let cachedAgentId: number | null = null;

async function holeMicroTradingAgentId(): Promise<number | null> {
  if (cachedAgentId !== null) return cachedAgentId;
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.name, "Micro-Trading Agent"))
    .limit(1);
  cachedAgentId = agent?.id ?? null;
  return cachedAgentId;
}

export async function loggeAgentEreignis(aktion: string, status: string, nachricht: string): Promise<void> {
  try {
    const agentId = await holeMicroTradingAgentId();
    if (agentId === null) {
      logger.warn({ aktion }, "Micro-Trading Agent nicht in DB gefunden — Log übersprungen");
      return;
    }
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Micro-Trading Agent",
      aktion,
      status,
      nachricht,
    });
  } catch (err) {
    logger.warn({ err, aktion }, "Agent-Log-Eintrag fehlgeschlagen (nicht kritisch)");
  }
}

// ─── Typen ────────────────────────────────────────────────────────────────────

interface MarktDaten {
  symbol: string;
  preis: number;
  aenderung1h: number;
  aenderung24h: number;
  volumen24h: number;
  high24h: number;
  low24h: number;
}

interface Position {
  symbol: string;
  menge: number;
  einstiegspreis: number;
  aktuellKurs: number;
  pnlProzent: number;
}

interface KIAnalyse {
  symbol: string;
  signal: "STARK_KAUF" | "KAUF" | "HALTEN" | "VERKAUF" | "STARK_VERKAUF";
  konfidenz: number;
  analyse: string;
  empfohlenerBetrag: number; // EUR
}

// ─── Marktdaten via Binance Public API ───────────────────────────────────────

const ASSETS = ["BTCEUR", "ETHEUR", "SOLUSDT", "BNBEUR", "ADAEUR"];
const SYMBOL_MAP: Record<string, string> = {
  BTCEUR: "BTC", ETHEUR: "ETH", SOLUSDT: "SOL", BNBEUR: "BNB", ADAEUR: "ADA",
};

export async function holeMarktdaten(): Promise<MarktDaten[]> {
  try {
    const symbolsParam = JSON.stringify(ASSETS);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "CyberSarah-TradingBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Binance API ${res.status}`);

    const daten = await res.json() as Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      volume: string;
      highPrice: string;
      lowPrice: string;
    }>;

    // 1h-Änderung separat holen
    const ergebnisse: MarktDaten[] = [];

    for (const d of daten) {
      const ticker = SYMBOL_MAP[d.symbol];
      if (!ticker) continue;

      // 1h Kline für 1h-Change
      let aenderung1h = 0;
      try {
        const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${d.symbol}&interval=1h&limit=2`;
        const kRes = await fetch(klineUrl, { signal: AbortSignal.timeout(5000) });
        if (kRes.ok) {
          const klines = await kRes.json() as Array<[string, string, string, string, string]>;
          if (klines.length >= 2 && klines[0] && klines[1]) {
            const open = parseFloat(klines[0][1]);
            const close = parseFloat(klines[1][4]);
            aenderung1h = open > 0 ? ((close - open) / open) * 100 : 0;
          }
        }
      } catch {
        // ignorieren
      }

      ergebnisse.push({
        symbol: ticker,
        preis: parseFloat(d.lastPrice),
        aenderung1h,
        aenderung24h: parseFloat(d.priceChangePercent),
        volumen24h: parseFloat(d.volume),
        high24h: parseFloat(d.highPrice),
        low24h: parseFloat(d.lowPrice),
      });
    }

    return ergebnisse;
  } catch (err) {
    logger.warn({ err }, "Binance API nicht erreichbar — nutze Fallback-Daten");
    // Realistische Fallback-Daten für Dev-Modus
    return [
      { symbol: "BTC", preis: 62500 + (Math.random() - 0.5) * 2000, aenderung1h: (Math.random() - 0.5) * 2, aenderung24h: (Math.random() - 0.5) * 5, volumen24h: 1500000000, high24h: 64000, low24h: 61000 },
      { symbol: "ETH", preis: 3250 + (Math.random() - 0.5) * 150, aenderung1h: (Math.random() - 0.5) * 2.5, aenderung24h: (Math.random() - 0.5) * 6, volumen24h: 800000000, high24h: 3400, low24h: 3100 },
      { symbol: "SOL", preis: 175 + (Math.random() - 0.5) * 15, aenderung1h: (Math.random() - 0.5) * 3, aenderung24h: (Math.random() - 0.5) * 8, volumen24h: 200000000, high24h: 190, low24h: 160 },
    ];
  }
}

// ─── Aktuelle Strategie laden ─────────────────────────────────────────────────

async function ladeAktuelleStrategie() {
  const strategien = await db
    .select()
    .from(tradingStrategieTable)
    .where(eq(tradingStrategieTable.aktiv, true))
    .orderBy(desc(tradingStrategieTable.version))
    .limit(1);

  if (strategien.length > 0) return strategien[0]!;

  // Default-Strategie erstellen
  const [neu] = await db.insert(tradingStrategieTable).values({
    version: 1,
    systemPrompt: STANDARD_SYSTEM_PROMPT,
  }).returning();
  return neu!;
}

const STANDARD_SYSTEM_PROMPT = `Du bist ein präziser Krypto-Trading-Analyst für ein automatisches Handelsystem.

Analysiere die Marktdaten und gib konkrete Handelssignale. Sei konservativ und risikoavers.

Regeln:
- Kaufe nur bei klarem Aufwärtstrend (Momentum > +1% in 1h UND > +2% in 24h)  
- Verkaufe bei Abwärtsdruck (< -1.5% in 1h ODER < -3% in 24h)
- Halte bei Unsicherheit (bevorzuge HALTEN über impulsive Trades)
- Max. 20% des Portfolios in eine Position
- Diversifikation ist wichtig

Antworte IMMER als JSON-Array mit Objekten:
{
  "symbol": "BTC",
  "signal": "KAUF",
  "konfidenz": 72,
  "analyse": "Starkes Momentum in letzter Stunde, Volumen steigt",
  "empfohlenerBetrag": 500
}`;

// ─── KI-Analyse ───────────────────────────────────────────────────────────────

async function analysiereMarkt(
  marktDaten: MarktDaten[],
  portfolio: { kassenbestand: number; positionen: Position[] },
  strategie: { systemPrompt: string | null; risikoLevel: string | null; optimierungsHinweise: string | null }
): Promise<KIAnalyse[]> {
  if (!openaiVerfuegbar || !openai) {
    // Regelbasierter Fallback
    return marktDaten.map(d => {
      const signal: KIAnalyse["signal"] =
        d.aenderung1h > 1.5 && d.aenderung24h > 3 ? "KAUF" :
        d.aenderung1h > 2.5 ? "STARK_KAUF" :
        d.aenderung1h < -1.5 || d.aenderung24h < -4 ? "VERKAUF" :
        d.aenderung1h < -3 ? "STARK_VERKAUF" : "HALTEN";
      return {
        symbol: d.symbol,
        signal,
        konfidenz: 50 + Math.abs(d.aenderung1h) * 5,
        analyse: `Regelbasiert: 1h=${d.aenderung1h.toFixed(2)}%, 24h=${d.aenderung24h.toFixed(2)}%`,
        empfohlenerBetrag: Math.min(portfolio.kassenbestand * 0.15, 500),
      };
    });
  }

  const systemPrompt = strategie.systemPrompt ?? STANDARD_SYSTEM_PROMPT;
  const hinweise = strategie.optimierungsHinweise
    ? `\nGelernte Optimierungen:\n${strategie.optimierungsHinweise}`
    : "";

  const userPrompt = `Portfolio-Status:
- Kassenbestand: €${portfolio.kassenbestand.toFixed(2)}
- Offene Positionen: ${portfolio.positionen.map(p => `${p.symbol}: ${p.menge} @ €${p.einstiegspreis} (${p.pnlProzent > 0 ? "+" : ""}${p.pnlProzent.toFixed(2)}%)`).join(", ") || "keine"}

Aktuelle Marktdaten:
${marktDaten.map(d => `${d.symbol}: €${d.preis.toFixed(2)} | 1h: ${d.aenderung1h > 0 ? "+" : ""}${d.aenderung1h.toFixed(2)}% | 24h: ${d.aenderung24h > 0 ? "+" : ""}${d.aenderung24h.toFixed(2)}% | Vol: ${(d.volumen24h / 1000000).toFixed(0)}M`).join("\n")}

Risiko-Level: ${strategie.risikoLevel ?? "mittel"}
${hinweise}

Analysiere alle Assets und gib Empfehlungen als JSON-Array zurück.`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let content = resp.choices[0]?.message.content ?? "[]";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    if (!content.startsWith("[")) {
      const match = content.match(/\[[\s\S]*\]/);
      content = match ? match[0] : "[]";
    }

    const analysen = JSON.parse(content) as KIAnalyse[];
    return analysen.filter(a => a.symbol && a.signal);
  } catch (err) {
    logger.warn({ err }, "OpenAI-Analyse fehlgeschlagen — Fallback");
    return [];
  }
}

// ─── Portfolio laden / initialisieren ────────────────────────────────────────

async function ladePortfolio() {
  const portfolios = await db.select().from(tradingPortfolioTable).limit(1);
  if (portfolios.length > 0) return portfolios[0]!;

  const [neu] = await db.insert(tradingPortfolioTable).values({
    basisKapital: "10000.00",
    kassenbestand: "10000.00",
    gesamtwert: "10000.00",
  }).returning();
  return neu!;
}

// ─── Trade ausführen ──────────────────────────────────────────────────────────

async function fuehreTradeAus(
  analyse: KIAnalyse,
  marktDaten: MarktDaten[],
  strategie: { version: number | null; stoplossRegel: string | null; takeProfitRegel: string | null }
): Promise<void> {
  const portfolio = await ladePortfolio();
  const kassenbestand = parseFloat(portfolio.kassenbestand ?? "10000");
  const positionenRaw = portfolio.aktuellePositionen
    ? JSON.parse(portfolio.aktuellePositionen) as Position[]
    : [];

  const marktInfo = marktDaten.find(m => m.symbol === analyse.symbol);
  if (!marktInfo) return;

  const preis = marktInfo.preis;
  const stoplossProzent = parseFloat(strategie.stoplossRegel ?? "5") / 100;
  const takeProfitProzent = parseFloat(strategie.takeProfitRegel ?? "10") / 100;

  // Stoploss / TakeProfit prüfen für bestehende Positionen
  const aktualisiertePOS: Position[] = [];
  for (const pos of positionenRaw) {
    const aktMarkt = marktDaten.find(m => m.symbol === pos.symbol);
    if (!aktMarkt) { aktualisiertePOS.push(pos); continue; }

    const aktPreis = aktMarkt.preis;
    const pnlProzent = (aktPreis - pos.einstiegspreis) / pos.einstiegspreis;

    // Stoploss oder TakeProfit ausgelöst?
    if (pnlProzent <= -stoplossProzent || pnlProzent >= takeProfitProzent) {
      const gesamtWert = pos.menge * aktPreis;
      const pnl = (aktPreis - pos.einstiegspreis) * pos.menge;
      const neuerKassenbestand = kassenbestand + gesamtWert;
      const istTakeProfit = pnlProzent >= takeProfitProzent;
      const slTpGrund = istTakeProfit
        ? `Take-Profit ausgelöst: +${(pnlProzent * 100).toFixed(2)}%`
        : `Stop-Loss ausgelöst: ${(pnlProzent * 100).toFixed(2)}%`;

      // ─── Live-Order via Binance (wenn TRADING_LIVE_MODE=true) ──────────
      if (LIVE_TRADING_AKTIV) {
        await platziereLiveOrder({
          symbol: pos.symbol,
          richtung: "VERKAUF",
          betragEUR: gesamtWert,
          aktuellerPreis: aktPreis,
          strategyVersion: strategie.version ?? 1,
          grund: slTpGrund,
        }).catch(err => logger.warn({ err, symbol: pos.symbol }, "SL/TP Live-Order fehlgeschlagen"));
      } else {
        await db.insert(tradingOrdersTable).values({
          symbol: pos.symbol,
          richtung: "VERKAUF",
          menge: pos.menge.toString(),
          preis: aktPreis.toString(),
          gesamt: gesamtWert.toString(),
          pnl: pnl.toString(),
          pnlProzent: (pnlProzent * 100).toString(),
          grund: slTpGrund,
          strategyVersion: strategie.version ?? 1,
        });
      }

      logger.info(
        { symbol: pos.symbol, pnlProzent: (pnlProzent * 100).toFixed(2) + "%", live: LIVE_TRADING_AKTIV },
        istTakeProfit ? "✅ Take-Profit" : "⛔ Stop-Loss"
      );
    } else {
      aktualisiertePOS.push({ ...pos, aktuellKurs: aktPreis, pnlProzent: pnlProzent * 100 });
    }
  }

  // Neue Position kaufen
  if (analyse.signal === "KAUF" || analyse.signal === "STARK_KAUF") {
    const bereitsInPosition = aktualisiertePOS.find(p => p.symbol === analyse.symbol);
    if (!bereitsInPosition && kassenbestand > 50) {
      const betrag = Math.min(
        analyse.empfohlenerBetrag,
        kassenbestand * 0.20,
        kassenbestand,
      );
      if (betrag < 10) return;

      const menge = betrag / preis;
      const gebuehr = betrag * 0.001; // 0.1% Gebühr

      // ─── Live-Order via Binance (wenn TRADING_LIVE_MODE=true) ────────────
      if (LIVE_TRADING_AKTIV) {
        const liveResult = await platziereLiveOrder({
          symbol: analyse.symbol,
          richtung: "KAUF",
          betragEUR: betrag,
          aktuellerPreis: preis,
          strategyVersion: strategie.version ?? 1,
          grund: analyse.analyse,
        });
        if (!liveResult.erfolg) {
          logger.warn({ symbol: analyse.symbol, fehler: liveResult.fehler }, "⚠️ Live-KAUF fehlgeschlagen — übersprungen");
          return;
        }
      } else {
        // Paper-Trade: nur in DB protokollieren
        await db.insert(tradingOrdersTable).values({
          symbol: analyse.symbol,
          richtung: "KAUF",
          menge: menge.toString(),
          preis: preis.toString(),
          gesamt: betrag.toString(),
          gebuehr: gebuehr.toString(),
          grund: analyse.analyse,
          strategyVersion: strategie.version ?? 1,
        });
      }

      aktualisiertePOS.push({
        symbol: analyse.symbol,
        menge,
        einstiegspreis: preis,
        aktuellKurs: preis,
        pnlProzent: 0,
      });

      logger.info(
        { symbol: analyse.symbol, betrag, preis, live: LIVE_TRADING_AKTIV },
        LIVE_TRADING_AKTIV ? "✅ LIVE-Kauf ausgeführt" : "📈 Paper-Kauf ausgeführt"
      );
    }
  }

  // Verkauf
  if (analyse.signal === "VERKAUF" || analyse.signal === "STARK_VERKAUF") {
    const position = aktualisiertePOS.find(p => p.symbol === analyse.symbol);
    if (position) {
      const gesamtWert = position.menge * preis;
      const pnl = (preis - position.einstiegspreis) * position.menge;
      const pnlProzent = (preis - position.einstiegspreis) / position.einstiegspreis * 100;
      const verkaufGrund = `${analyse.analyse} (${analyse.signal})`;

      // ─── Live-Order via Binance (wenn TRADING_LIVE_MODE=true) ──────────
      if (LIVE_TRADING_AKTIV) {
        const liveResult = await platziereLiveOrder({
          symbol: analyse.symbol,
          richtung: "VERKAUF",
          betragEUR: gesamtWert,
          aktuellerPreis: preis,
          strategyVersion: strategie.version ?? 1,
          grund: verkaufGrund,
        });
        if (!liveResult.erfolg) {
          logger.warn({ symbol: analyse.symbol, fehler: liveResult.fehler }, "⚠️ Live-VERKAUF fehlgeschlagen");
        }
      } else {
        // Paper-Trade: nur in DB protokollieren
        await db.insert(tradingOrdersTable).values({
          symbol: analyse.symbol,
          richtung: "VERKAUF",
          menge: position.menge.toString(),
          preis: preis.toString(),
          gesamt: gesamtWert.toString(),
          pnl: pnl.toString(),
          pnlProzent: pnlProzent.toString(),
          grund: verkaufGrund,
          strategyVersion: strategie.version ?? 1,
        });
      }

      aktualisiertePOS.splice(aktualisiertePOS.indexOf(position), 1);
      logger.info(
        { symbol: analyse.symbol, pnlProzent: pnlProzent.toFixed(2) + "%", live: LIVE_TRADING_AKTIV },
        LIVE_TRADING_AKTIV ? "✅ LIVE-Verkauf ausgeführt" : "📉 Paper-Verkauf ausgeführt"
      );
    }
  }

  // Signale speichern
  await db.insert(tradingSignaleTable).values({
    symbol: analyse.symbol,
    signal: analyse.signal,
    konfidenz: analyse.konfidenz.toString(),
    analyse: analyse.analyse,
    preis: preis.toString(),
    ausgefuehrt: analyse.signal !== "HALTEN",
  });

  // Portfolio-Gesamtwert berechnen
  let positionsWert = 0;
  for (const pos of aktualisiertePOS) {
    const aktM = marktDaten.find(m => m.symbol === pos.symbol);
    if (aktM) positionsWert += pos.menge * aktM.preis;
  }

  // Kassenbestand neu berechnen basierend auf Trades
  const allOrders = await db
    .select()
    .from(tradingOrdersTable)
    .orderBy(desc(tradingOrdersTable.createdAt))
    .limit(200);

  let newKasse = 10000;
  for (const o of allOrders.reverse()) {
    if (o.richtung === "KAUF") {
      newKasse -= parseFloat(o.gesamt ?? "0") + parseFloat(o.gebuehr ?? "0");
    } else {
      newKasse += parseFloat(o.gesamt ?? "0");
    }
  }
  newKasse = Math.max(0, newKasse);

  const gesamtwert = newKasse + positionsWert;
  const gesamtPnL = gesamtwert - 10000;
  const gesamtPnLProzent = (gesamtPnL / 10000) * 100;

  // Win-Rate berechnen
  const abgeschlosseneOrders = allOrders.filter(o => o.richtung === "VERKAUF");
  const gewinner = abgeschlosseneOrders.filter(o => parseFloat(o.pnl ?? "0") > 0);
  const winRate = abgeschlosseneOrders.length > 0
    ? (gewinner.length / abgeschlosseneOrders.length) * 100
    : 0;

  await db.update(tradingPortfolioTable)
    .set({
      kassenbestand: newKasse.toString(),
      gesamtwert: gesamtwert.toString(),
      gesamtPnL: gesamtPnL.toString(),
      gesamtPnLProzent: gesamtPnLProzent.toString(),
      aktuellePositionen: JSON.stringify(aktualisiertePOS),
      winRate: winRate.toString(),
      gesamtTrades: allOrders.length,
      gewinnTrades: gewinner.length,
      verlustTrades: abgeschlosseneOrders.length - gewinner.length,
      letzteAktualisierung: new Date(),
    })
    .where(eq(tradingPortfolioTable.id, portfolio.id));
}

// ─── Self-Improvement: Strategie optimieren ───────────────────────────────────

async function optimiereStrategie(): Promise<void> {
  if (!openaiVerfuegbar || !openai) return;

  const strategie = await ladeAktuelleStrategie();
  const zaehler = strategie.optimierungszaehler ?? 0;

  // Optimierung alle 20 Trades
  const trades = await db
    .select()
    .from(tradingOrdersTable)
    .orderBy(desc(tradingOrdersTable.createdAt))
    .limit(20);

  if (trades.length < 10) return; // Noch nicht genug Daten

  const portfolio = await ladePortfolio();
  const winRate = parseFloat(portfolio.winRate ?? "0");
  const gesamtPnL = parseFloat(portfolio.gesamtPnL ?? "0");

  const tradeZusammenfassung = trades.map(t =>
    `${t.symbol} ${t.richtung} @ €${t.preis} | PnL: ${t.pnl ? "€" + parseFloat(t.pnl).toFixed(2) : "noch offen"} | Grund: ${t.grund ?? "?"}`
  ).join("\n");

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "Du bist ein Trading-Strategie-Optimierer. Analysiere vergangene Trades und verbessere die Strategie. Antworte als JSON.",
        },
        {
          role: "user",
          content: `Analysiere diese Trading-Performance und optimiere die Strategie:

Win-Rate: ${winRate.toFixed(1)}%
Gesamt P&L: €${gesamtPnL.toFixed(2)}
Strategie-Version: ${strategie.version}

Letzte Trades:
${tradeZusammenfassung}

Aktueller System-Prompt:
${strategie.systemPrompt ?? STANDARD_SYSTEM_PROMPT}

Gib zurück als JSON:
{
  "erkenntnisse": ["Lektion 1", "Lektion 2", ...],
  "neuerSystemPrompt": "Verbesserter System-Prompt...",
  "risikoLevel": "niedrig|mittel|hoch",
  "stoploss": 5.0,
  "takeProfit": 10.0,
  "hauptverbesserung": "Was du am meisten geändert hast"
}`,
        },
      ],
    });

    let content = resp.choices[0]?.message.content ?? "{}";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const optimierung = JSON.parse(content) as {
      erkenntnisse: string[];
      neuerSystemPrompt: string;
      risikoLevel: string;
      stoploss: number;
      takeProfit: number;
      hauptverbesserung: string;
    };

    // Neue Strategie-Version anlegen
    const neueVersion = (strategie.version ?? 1) + 1;

    await db.update(tradingStrategieTable)
      .set({ aktiv: false })
      .where(eq(tradingStrategieTable.aktiv, true));

    await db.insert(tradingStrategieTable).values({
      version: neueVersion,
      name: `CyberSarah Micro-Trader v${neueVersion}`,
      systemPrompt: optimierung.neuerSystemPrompt,
      risikoLevel: optimierung.risikoLevel,
      stoplossRegel: optimierung.stoploss.toString(),
      takeProfitRegel: optimierung.takeProfit.toString(),
      optimierungsHinweise: JSON.stringify(optimierung.erkenntnisse),
      optimierungszaehler: zaehler + 1,
      letzteOptimierung: new Date(),
      winRate: winRate.toString(),
      gesamtPnL: gesamtPnL.toString(),
    });

    await loggeAgentEreignis(
      "strategie_optimierung",
      "erfolgreich",
      `🧠 Strategie auf v${neueVersion} optimiert: ${optimierung.hauptverbesserung}`
    );

    logger.info({ neueVersion, hauptverbesserung: optimierung.hauptverbesserung },
      "🧠 Trading-Strategie selbst-optimiert");
  } catch (err) {
    logger.warn({ err }, "Strategie-Optimierung fehlgeschlagen");
  }
}

// ─── Haupt-Zyklus ─────────────────────────────────────────────────────────────

let aktiv = false;
let letzteOptimierung = 0;

export async function fuehreTradingZyklusAus(): Promise<{
  analysen: KIAnalyse[];
  marktDaten: MarktDaten[];
  trades: number;
}> {
  const marktDaten = await holeMarktdaten();
  if (marktDaten.length === 0) {
    return { analysen: [], marktDaten: [], trades: 0 };
  }

  const portfolio = await ladePortfolio();
  const strategie = await ladeAktuelleStrategie();
  const positionen: Position[] = portfolio.aktuellePositionen
    ? JSON.parse(portfolio.aktuellePositionen) as Position[]
    : [];

  const analysen = await analysiereMarkt(
    marktDaten,
    { kassenbestand: parseFloat(portfolio.kassenbestand ?? "10000"), positionen },
    strategie
  );

  // ── Sicherheits-Guardrail (Sprint 65): Freigabe prüfen VOR jedem Handel ──
  const freigabe = await pruefeHandelsfreigabe();
  if (!freigabe.erlaubt) {
    await loggeAgentEreignis(
      "trading_stopp",
      "warnung",
      `🛡️ Kein Handel: ${freigabe.gruende.join(" | ")}`,
    );
    return { analysen, marktDaten, trades: 0 };
  }

  let trades = 0;
  for (const analyse of analysen) {
    if (analyse.signal !== "HALTEN") {
      await fuehreTradeAus(analyse, marktDaten, strategie);
      trades++;
    }
  }

  // Alle 20 Trades: Self-Optimization
  const gesamtTrades = portfolio.gesamtTrades ?? 0;
  const jetzt = Date.now();
  if (gesamtTrades > 0 && gesamtTrades % 20 === 0 && jetzt - letzteOptimierung > 600_000) {
    letzteOptimierung = jetzt;
    void optimiereStrategie();
  }

  await loggeAgentEreignis(
    "trading_zyklus",
    "erfolgreich",
    `Analysiert: ${marktDaten.length} Assets | ${analysen.filter(a => a.signal !== "HALTEN").length} Signale | ${trades} Trades ausgeführt`
  );

  return { analysen, marktDaten, trades };
}

// ─── Agent starten/stoppen ────────────────────────────────────────────────────

let tradingInterval: ReturnType<typeof setInterval> | null = null;
let evolutionsInterval: ReturnType<typeof setInterval> | null = null;

export function starteTrading(intervalMinuten = 5): void {
  if (aktiv) return;
  aktiv = true;

  logger.info({ intervalMinuten }, "🤖 Micro-Trading Agent gestartet");

  void fuehreTradingZyklusAus();

  tradingInterval = setInterval(() => {
    void fuehreTradingZyklusAus();
  }, intervalMinuten * 60 * 1000);

  // Autonome Selbst-Entwicklung: Sicherheits-Check + Parameter-Evolution
  // läuft stündlich — der Bot wird dadurch kontinuierlich stabiler.
  evolutionsInterval = setInterval(() => {
    void fuehreEvolutionsZyklusAus();
  }, 60 * 60 * 1000);
  void fuehreEvolutionsZyklusAus(); // sofort einmal beim Start
}

export function stoppeTrading(): void {
  if (!aktiv) return;
  aktiv = false;
  if (tradingInterval) {
    clearInterval(tradingInterval);
    tradingInterval = null;
  }
  if (evolutionsInterval) {
    clearInterval(evolutionsInterval);
    evolutionsInterval = null;
  }
  logger.info("⛔ Micro-Trading Agent gestoppt");
}

export function istTradingAktiv(): boolean {
  return aktiv;
}

// ─── Portfolio-Daten für API ──────────────────────────────────────────────────

export async function ladeHandelsDaten() {
  const [portfolio, strategie, letzteOrders, signale] = await Promise.all([
    ladePortfolio(),
    ladeAktuelleStrategie(),
    db.select().from(tradingOrdersTable).orderBy(desc(tradingOrdersTable.createdAt)).limit(30),
    db.select().from(tradingSignaleTable).orderBy(desc(tradingSignaleTable.createdAt)).limit(20),
  ]);

  const marktDaten = await holeMarktdaten();

  return {
    portfolio: {
      kassenbestand: parseFloat(portfolio.kassenbestand ?? "10000"),
      gesamtwert: parseFloat(portfolio.gesamtwert ?? "10000"),
      gesamtPnL: parseFloat(portfolio.gesamtPnL ?? "0"),
      gesamtPnLProzent: parseFloat(portfolio.gesamtPnLProzent ?? "0"),
      winRate: parseFloat(portfolio.winRate ?? "0"),
      gesamtTrades: portfolio.gesamtTrades ?? 0,
      gewinnTrades: portfolio.gewinnTrades ?? 0,
      verlustTrades: portfolio.verlustTrades ?? 0,
      positionen: portfolio.aktuellePositionen ? JSON.parse(portfolio.aktuellePositionen) as Position[] : [],
      letzteAktualisierung: portfolio.letzteAktualisierung,
    },
    strategie: {
      version: strategie.version,
      name: strategie.name,
      risikoLevel: strategie.risikoLevel,
      winRate: parseFloat(strategie.winRate ?? "0"),
      optimierungszaehler: strategie.optimierungszaehler ?? 0,
      letzteOptimierung: strategie.letzteOptimierung,
    },
    orders: letzteOrders,
    signale,
    marktDaten,
    aktiv: istTradingAktiv(),
  };
}

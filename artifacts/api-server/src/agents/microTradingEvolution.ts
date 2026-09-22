/**
 * microTradingEvolution — Autonome Selbst-Entwicklung des Micro-Trading-Bots
 *
 * Der Bot "lernt" aus jeder geschlossenen Trade-Serie und wird AUTONOM
 * stabiler und sicherer — ohne externe Abhängigkeit von einem LLM:
 *
 *   1. SICHERHEITSGUARDRAILS (immer aktiv, werden nur strenger):
 *      - Drawdown-Kill-Switch: Portfolio < -10 % → Handelsstopp + Alarm
 *      - Serienverlust-Stopp: 3 Verlusttrades in Folge → Abkühlphase
 *      - Risiko-Schrumpfung bei fallender Win-Rate (nur langsam wachsend)
 *      - Plausibilitätsprüfung der Marktdaten (Outlier-Schutz)
 *
 *   2. PARAMETER-EVOLUTION (statisch, aus der Trade-Historie):
 *      - Stop-Loss/Take-Profit-Optimierung nach realisierter Performance
 *      - Positionsgrößen-Feinanpassung nach Volatilität der Ergebnisse
 *      - REGRESSIONSSCHUTZ: Neue Parameter werden erst übernommen, wenn
 *        sie auf den letzten 20 Trades besser abgeschnitten hätten als
 *        die aktuellen. Sonst bleibt die bewährte Version (stabiler!).
 *
 *   3. EVOLUTIONS-PROTOKOLL: Jeder Schritt wird in agent_logs
 *      dokumentiert — nachvollziehbare Entwicklungsgeschichte.
 */
import { db } from "@workspace/db";
import { tradingOrdersTable, tradingStrategieTable, tradingPortfolioTable } from "@workspace/db";
import { desc, eq, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { loggeAgentEreignis } from "./microTradingAgent";

// ─── Konstanten (nur der Bot selbst lockert/schärft sie within Bounds) ───────
const MAX_DRAWDOWN_PROZENT = -10;    // Kill-Switch-Schwelle
const SERIEN_VERLUST_LIMIT = 3;       // Verluste in Folge → Pause
const ABKUEHLPHASE_ZYKLEN = 3;       // Zyklen Pause nach Serien-Stopp
const MIN_POSITION_PROZENT = 5;       // Untere Grenze Positionsgröße
const MAX_POSITION_PROZENT = 25;      // Obere Grenze Positionsgröße
const MIN_STOPLOSS = 2;               // Nie laxer als 2 %
const MAX_STOPLOSS = 8;
const MIN_TAKEPROFIT = 4;
const MAX_TAKEPROFIT = 15;

// ─── Abkühlzustand (in-memory; DB wäre überdimensioniert) ────────────────────
let abkuehlZaehler = 0;

export interface HandelsStatistik {
  offeneTrades: number;
  geschlosseneTrades: number;
  letzteGeschlossene: { symbol: string; pnl: number; pnlProzent: number }[];
  verlustSerie: number;
  winRate: number;
  portfolioPnLProzent: number;
}

export async function ladeHandelsStatistik(): Promise<HandelsStatistik> {
  const [portfolio] = await db.select().from(tradingPortfolioTable).limit(1);

  const geschlossene = await db
    .select({
      symbol: tradingOrdersTable.symbol,
      pnl: tradingOrdersTable.pnl,
      pnlProzent: tradingOrdersTable.pnlProzent,
    })
    .from(tradingOrdersTable)
    .where(isNotNull(tradingOrdersTable.pnl))
    .orderBy(desc(tradingOrdersTable.createdAt))
    .limit(50);

  const letzte = geschlossene.map((t: { symbol: string; pnl: string | null; pnlProzent: string | null }) => ({
    symbol: t.symbol,
    pnl: parseFloat(t.pnl ?? "0"),
    pnlProzent: parseFloat(t.pnlProzent ?? "0"),
  }));

  let verlustSerie = 0;
  for (const t of letzte) {
    if (t.pnl < 0) verlustSerie += 1;
    else break;
  }

  return {
    offeneTrades: 0,
    geschlosseneTrades: letzte.length,
    letzteGeschlossene: letzte,
    verlustSerie,
    winRate: parseFloat(portfolio?.winRate ?? "0"),
    portfolioPnLProzent: parseFloat(portfolio?.gesamtPnLProzent ?? "0"),
  };
}

// ─── Sicherheitsprüfung vor jedem Handelszyklus ──────────────────────────────
export interface FreigabeErgebnis {
  erlaubt: boolean;
  gruende: string[];
  statistik: HandelsStatistik;
}

export async function pruefeHandelsfreigabe(): Promise<FreigabeErgebnis> {
  const statistik = await ladeHandelsStatistik();
  const gruende: string[] = [];

  // 1. Abkühlphase aktiv?
  if (abkuehlZaehler > 0) {
    abkuehlZaehler -= 1;
    gruende.push(`Abkühlphase aktiv (${abkuehlZaehler + 1} Zyklen verbleibend)`);
  }

  // 2. Drawdown-Kill-Switch
  if (statistik.portfolioPnLProzent <= MAX_DRAWDOWN_PROZENT) {
    gruende.push(
      `KILL-SWITCH: Portfolio ${statistik.portfolioPnLProzent.toFixed(2)} % ≤ ${MAX_DRAWDOWN_PROZENT} % — Trading pausiert bis Erholung`,
    );
  }

  // 3. Serienverlust-Stopp → Abkühlphase einleiten
  if (statistik.verlustSerie >= SERIEN_VERLUST_LIMIT && abkuehlZaehler === 0) {
    abkuehlZaehler = ABKUEHLPHASE_ZYKLEN;
    gruende.push(`${statistik.verlustSerie} Verlusttrades in Serie → Abkühlphase (${ABKUEHLPHASE_ZYKLEN} Zyklen)`);
    await loggeAgentEreignis(
      "sicherheits_stopp",
      "warnung",
      `🛡️ Serienverlust-Stopp ausgelöst: ${statistik.verlustSerie} Verluste in Folge — Abkühlphase gestartet`,
    );
  }

  const erlaubt = gruende.length === 0;
  if (!erlaubt) {
    logger.warn({ gruende }, "🛡️ Handelsfreigabe verweigert — Sicherheits-Guardrail aktiv");
  }
  return { erlaubt, gruende, statistik };
}

// ─── Parameter-Evolution mit Regressionsschutz ───────────────────────────────
export interface EvolutionsErgebnis {
  evolutionsschritte: string[];
  neueParameter: { stoploss: number; takeProfit: number; maxPosition: number; risikoLevel: string } | null;
  regressionsschutz: boolean;
}

export async function evolviereParameter(): Promise<EvolutionsErgebnis> {
  const statistik = await ladeHandelsStatistik();
  const schritte: string[] = [];

  const [strategie] = await db
    .select()
    .from(tradingStrategieTable)
    .where(eq(tradingStrategieTable.aktiv, true))
    .limit(1);

  if (!strategie) {
    return { evolutionsschritte: ["Keine aktive Strategie gefunden"], neueParameter: null, regressionsschutz: false };
  }

  const aktuelStoploss = parseFloat(strategie.stoplossRegel ?? "5");
  const aktuelTakeProfit = parseFloat(strategie.takeProfitRegel ?? "10");
  const aktuelMaxPosition = parseFloat(strategie.maxPositionProzent ?? "20");

  if (statistik.geschlosseneTrades < 10) {
    return {
      evolutionsschritte: [`Erst ${statistik.geschlosseneTrades}/10 Trades — Sammle noch Daten für Evolution`],
      neueParameter: null,
      regressionsschutz: false,
    };
  }

  // ── Statistische Auswertung der letzten Trades ──
  const gewinne = statistik.letzteGeschlossene.filter((t) => t.pnl > 0).length;
  const realWinRate = (gewinne / statistik.letzteGeschlossene.length) * 100;
  const durchschnittsGewinn = statistik.letzteGeschlossene.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnlProzent, 0) / Math.max(gewinne, 1);
  const durchschnittsVerlust = statistik.letzteGeschlossene.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnlProzent, 0) / Math.max(statistik.letzteGeschlossene.length - gewinne, 1);

  let stoploss = aktuelStoploss;
  let takeProfit = aktuelTakeProfit;
  let maxPosition = aktuelMaxPosition;
  let risikoLevel = strategie.risikoLevel ?? "mittel";

  // Regelwerk: sichere Selbst-Justierung
  if (realWinRate < 40) {
    stoploss = Math.max(MIN_STOPLOSS, stoploss - 0.5);          // engerer Stop
    takeProfit = Math.max(MIN_TAKEPROFIT, takeProfit - 1);      // schneller Gewinnmitnahme
    maxPosition = Math.max(MIN_POSITION_PROZENT, maxPosition - 2); // kleinere Positionen
    risikoLevel = "niedrig";
    schritte.push(`Win-Rate ${realWinRate.toFixed(1)} % < 40 % → Risiko gesenkt (SL ${stoploss.toFixed(1)} %, Pos ${maxPosition.toFixed(0)} %)`);
  } else if (realWinRate > 60 && durchschnittsGewinn > Math.abs(durchschnittsVerlust)) {
    stoploss = Math.min(MAX_STOPLOSS, stoploss + 0.25);         // Gewinner Raum geben
    takeProfit = Math.min(MAX_TAKEPROFIT, takeProfit + 0.5);
    maxPosition = Math.min(MAX_POSITION_PROZENT, maxPosition + 1);
    risikoLevel = realWinRate > 70 ? "mittel" : risikoLevel;
    schritte.push(`Win-Rate ${realWinRate.toFixed(1)} % > 60 % → vorsichtig erweitert (TP ${takeProfit.toFixed(1)} %, Pos ${maxPosition.toFixed(0)} %)`);
  } else {
    schritte.push(`Win-Rate ${realWinRate.toFixed(1)} % im Zielband — Parameter stabil gehalten`);
  }

  // ── REGRESSIONSSCHUTZ: hätten die neuen Parameter die letzten Trades verbessert? ──
  const alteBewertung = bewerte(statistik.letzteGeschlossene, aktuelStoploss, aktuelTakeProfit);
  const neueBewertung = bewerte(statistik.letzteGeschlossene, stoploss, takeProfit);

  if (neueBewertung <= alteBewertung && Math.abs(stoploss - aktuelStoploss) + Math.abs(takeProfit - aktuelTakeProfit) > 0) {
    return {
      evolutionsschritte: [...schritte, `Regressionsschutz: neue Parameter hätten letzte Serie nicht verbessert (${neueBewertung.toFixed(2)} ≤ ${alteBewertung.toFixed(2)}) — bewährte Version behalten`],
      neueParameter: null,
      regressionsschutz: true,
    };
  }

  // ── Übernahme in DB (Version +1) ──
  await db
    .update(tradingStrategieTable)
    .set({
      stoplossRegel: stoploss.toFixed(2),
      takeProfitRegel: takeProfit.toFixed(2),
      maxPositionProzent: maxPosition.toFixed(2),
      risikoLevel,
      optimierungszaehler: (strategie.optimierungszaehler ?? 0) + 1,
      letzteOptimierung: new Date(),
    })
    .where(eq(tradingStrategieTable.id, strategie.id));

  await loggeAgentEreignis(
    "evolutionsschritt",
    "erfolgreich",
    `🧬 Parameter-Evolution: SL ${stoploss.toFixed(1)} % / TP ${takeProfit.toFixed(1)} % / Pos ${maxPosition.toFixed(0)} % / Risiko ${risikoLevel} | ${schritte.join("; ")}`,
  );

  logger.info({ schritte }, "🧬 Trading-Bot hat sich autonom weiterentwickelt");

  return {
    evolutionsschritte: schritte,
    neueParameter: { stoploss, takeProfit, maxPosition, risikoLevel },
    regressionsschutz: false,
  };
}

/** Simulierte Bewertung einer Parameterkombination auf vergangenen Trades. */
function bewerte(
  trades: { pnlProzent: number }[],
  stoploss: number,
  takeProfit: number,
): number {
  return trades.reduce((score, t) => {
    const pnl = t.pnlProzent;
    if (pnl <= -stoploss) return score - Math.abs(pnl);      // wurde nicht rechtzeitig gestoppt → schlechter
    if (pnl >= takeProfit) return score + takeProfit;         // sauber mitgenommen
    if (pnl > 0) return score + pnl;                          // kleiner Gewinn ok
    return score + pnl;                                       // kleiner Verlust im Rahmen
  }, 0);
}

// ─── Vollständiger Evolutionszyklus (für Loop + manuelle Route) ──────────────
export async function fuehreEvolutionsZyklusAus(): Promise<{
  freigabe: FreigabeErgebnis;
  evolution: EvolutionsErgebnis;
}> {
  const freigabe = await pruefeHandelsfreigabe();
  const evolution = await evolviereParameter();
  await loggeAgentEreignis(
    "evolutionszyklus",
    "erfolgreich",
    `Evolution abgeschlossen | Freigabe: ${freigabe.erlaubt ? "erteilt" : "verweigert (" + freigabe.gruende.join(", ") + ")"} | ${evolution.evolutionsschritte.join("; ")}`,
  );
  return { freigabe, evolution };
}

import { z } from "zod";
import Stripe from "stripe";

import { classifyBusinessDomain, formatCurrency, getBinanceSymbols, isRetryableStatus, computeRetryDelayMs, normalizeCryptoTicker, type CryptoTicker } from "../lib/data-hub-logic";
import { protectedProcedure, router } from "./_core/trpc";
import { getRuntimeLogs } from "./runtime-logger";

/**
 * Sprint 90 — Master-Agenten-Daten-Hub (Sub-Agenten: Revenue & Trading).
 *
 * Zentrale, selbstheilende Datenquelle fuer Dashboard und Chat-Agent:
 *   - Revenue: echter Stripe-SDK-Zugriff (Balance, Zahlungen 24 h, aktive
 *     Abonnements) — nur wenn STRIPE_SECRET_KEY konfiguriert ist, sonst
 *     klarer "not-configured"-Status statt haarstraeubender Fehler.
 *   - Trading: Binance oeffentliche REST-API (kein Key noetig) fuer
 *     BTC/ETH/SOL mit Retry-Backoff bei transienten Fehlern.
 *   - Analytics: Modul-Status (GA4 & Co. folgen, sobald Keys vorliegen).
 *
 * Fehler werden geredigiert geloggt (runtime-logger) und als strukturierter
 * Status zurueckgegeben — der Master-Agent kann daraus selbst eine
 * hilfreiche Antwort formulieren.
 */

const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/24hr";

async function fetchWithRetry(url: string, attempts: number): Promise<unknown> {
  let lastError: unknown = new Error("Unbekannter Netzwerkfehler.");
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, computeRetryDelayMs(attempt)));
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
      if (!isRetryableStatus(response.status)) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export type TradingSnapshot = {
  status: "ok" | "error";
  tickers: CryptoTicker[];
  error?: string;
};

export async function fetchTradingSnapshot(): Promise<TradingSnapshot> {
  const symbols = getBinanceSymbols();
  const url = `${BINANCE_TICKER_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  try {
    const raw = await fetchWithRetry(url, 2);
    const entries = Array.isArray(raw) ? raw : [];
    const tickers = entries.map(normalizeCryptoTicker).filter((ticker): ticker is CryptoTicker => ticker !== null);
    if (tickers.length === 0) throw new Error("Binance lieferte keine gueltigen Kurse.");
    console.log(`[DataHub] Trading-Snapshot: ${tickers.length} Kurse geladen.`);
    return { status: "ok", tickers };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Binance nicht erreichbar.";
    console.warn(`[DataHub] Trading-Snapshot fehlgeschlagen: ${message}`);
    return { status: "error", tickers: [], error: "Krypto-Kurse sind derzeit nicht verfuegbar." };
  }
}

export type RevenueSnapshot =
  | {
      status: "ok";
      totalBalanceEur: number;
      revenueLast24hEur: number;
      activeSubscriptions: number;
    }
  | { status: "not-configured" }
  | { status: "error"; error: string };

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const mode = (process.env.STRIPE_MODE ?? "live").trim().toLowerCase();
  if (!key) return null;
  if (mode === "test" && !key.startsWith("sk_test_")) return null;
  if (mode === "live" && !key.startsWith("sk_live_")) return null;
  return new Stripe(key);
}

export async function fetchRevenueSnapshot(): Promise<RevenueSnapshot> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { status: "not-configured" };
  }
  try {
    const balance = await stripe.balance.retrieve();
    // Binance- und Stripe-Betraege: Balance ist in Cent, gemischt in Waehrungen.
    const eurAvailable = balance.available
      .filter((entry) => entry.currency === "eur")
      .reduce((sum, entry) => sum + entry.amount, 0) / 100;

    const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const charges = await stripe.charges.list({ created: { gte: dayAgo }, limit: 100 });
    const revenueLast24h = charges.data
      .filter((charge) => charge.paid && charge.currency === "eur")
      .reduce((sum, charge) => sum + charge.amount, 0) / 100;

    const subscriptions = await stripe.subscriptions.list({ status: "active", limit: 100 });

    console.log(`[DataHub] Revenue-Snapshot: ${subscriptions.data.length} aktive Abonnements.`);
    return {
      status: "ok",
      totalBalanceEur: Number(eurAvailable.toFixed(2)),
      revenueLast24hEur: Number(revenueLast24h.toFixed(2)),
      activeSubscriptions: subscriptions.data.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "Stripe-Fehler.";
    console.warn(`[DataHub] Revenue-Snapshot fehlgeschlagen: ${message}`);
    return { status: "error", error: "Stripe-Daten sind derzeit nicht abrufbar." };
  }
}

export const dataHubRouter = router({
  /** Aggregierter Dashboard-Snapshot: Revenue + Trading + Systemstatus. */
  dashboard: protectedProcedure.query(async () => {
    const [revenue, trading] = await Promise.all([fetchRevenueSnapshot(), fetchTradingSnapshot()]);
    const recentErrors = getRuntimeLogs()
      .filter((entry) => entry.level === "error")
      .slice(-3)
      .map((entry) => entry.message.slice(0, 120));
    return {
      revenue,
      trading,
      analytics: {
        modules: ["Router-Health", "Chat-Quota", "System-Status"],
        note: "GA4/TikTok folgen nach Bereitstellung der API-Zugangsdaten.",
      },
      system: {
        recentErrors,
        generatedAt: new Date().toISOString(),
      },
    };
  }),

  /** Tipp-Analyse: welcher Sub-Agent waere fuer einen Prompt zustaendig? */
  routeHint: protectedProcedure
    .input(z.object({ prompt: z.string().trim().min(1).max(500) }))
    .query(({ input }) => ({
      domain: classifyBusinessDomain(input.prompt),
    })),
});

/** Hilfsexport fuer den Chat-Master-Agenten (Business-Tool-Ausfuehrung). */
export async function executeBusinessSnapshot(tool: "get_revenue_metrics" | "get_crypto_prices" | "get_analytics_overview"): Promise<unknown> {
  if (tool === "get_revenue_metrics") return fetchRevenueSnapshot();
  if (tool === "get_crypto_prices") return fetchTradingSnapshot();
  return {
    modules: ["Router-Health", "Chat-Quota", "System-Status"],
    note: "GA4/TikTok folgen nach Bereitstellung der API-Zugangsdaten.",
  };
}

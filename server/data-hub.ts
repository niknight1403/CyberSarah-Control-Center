import { z } from "zod";
import Stripe from "stripe";

import {
  classifyBusinessDomain,
  formatCurrency,
  getBinanceSymbols,
  getKrakenPairs,
  isRetryableStatus,
  computeRetryDelayMs,
  normalizeCryptoTicker,
  normalizeKrakenTicker,
  normalizeGa4Report,
  type CryptoTicker,
} from "../lib/data-hub-logic";
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

async function fetchWithRetry(
  url: string,
  attempts: number,
  bearerToken?: string,
  jsonBody?: unknown,
  createdAfterIso?: string,
): Promise<unknown> {
  let lastError: unknown = new Error("Unbekannter Netzwerkfehler.");
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, computeRetryDelayMs(attempt)));
    }
    try {
      const response = await fetch(url, {
        method: jsonBody ? "POST" : "GET",
        signal: AbortSignal.timeout(8_000),
        headers: {
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          ...(jsonBody ? { "Content-Type": "application/json" } : {}),
        },
        body: jsonBody ? JSON.stringify(jsonBody) : undefined,
      });
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
    console.warn(`[DataHub] Trading-Snapshot fehlgeschlagen: ${message} — versuche Kraken-Fallback.`);
    try {
      return await fetchTradingSnapshotFromKraken();
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Kraken nicht erreichbar.";
      console.warn(`[DataHub] Kraken-Fallback fehlgeschlagen: ${fallbackMessage}`);
      return { status: "error", tickers: [], error: "Krypto-Kurse sind derzeit nicht verfuegbar (Binance und Kraken)." };
    }
  }
}


const KRAKEN_TICKER_URL = "https://api.kraken.com/0/public/Ticker";

/** Selbstheilender Fallback: Kraken oeffentliche API, wenn Binance ausfaellt. */
async function fetchTradingSnapshotFromKraken(): Promise<TradingSnapshot> {
  const pairs = getKrakenPairs();
  const pairParam = pairs.map((entry) => entry.pair).join(",");
  const raw = await fetchWithRetry(`${KRAKEN_TICKER_URL}?pair=${encodeURIComponent(pairParam)}`, 1);
  const tickers = pairs
    .map((pair) => normalizeKrakenTicker(pair, raw))
    .filter((ticker): ticker is CryptoTicker => ticker !== null);
  if (tickers.length === 0) throw new Error("Kraken lieferte keine gueltigen Kurse.");
  console.log(`[DataHub] Trading-Snapshot (Kraken-Fallback): ${tickers.length} Kurse geladen.`);
  return { status: "ok", tickers };
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


/* ==================== Sprint 93 — Sub-Agenten-Erweiterung ==================== */

export type AnalyticsSnapshot =
  | { status: "ok"; activeUsers: number; sessions: number; conversions: number }
  | { status: "not-configured"; modules: string[] };

const GA4_REPORT_URL_PREFIX = "https://analyticsdata.googleapis.com/v1beta/properties/";

/** Analytics-Agent: GA4 Data API (7 Tage) — key-gated, selbstheilend mit Retry-Backoff. */
export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const token = process.env.GA4_ACCESS_TOKEN?.trim();
  if (!propertyId || !token) {
    return { status: "not-configured", modules: ["Router-Health", "Chat-Quota", "System-Status"] };
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const raw = await fetchWithRetry(
      `${GA4_REPORT_URL_PREFIX}${encodeURIComponent(propertyId)}:runReport`,
      1,
      token,
      {
        dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "conversions" }],
      },
    );
    const report = normalizeGa4Report(raw);
    if (!report) throw new Error("GA4-Antwort konnte nicht normalisiert werden.");
    console.log(`[DataHub] Analytics-Snapshot: ${report.activeUsers} aktive Nutzer (7 Tage).`);
    return { status: "ok", activeUsers: report.activeUsers, sessions: report.sessions, conversions: report.conversions };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "GA4-Fehler.";
    console.warn(`[DataHub] Analytics-Snapshot fehlgeschlagen: ${message}`);
    return { status: "not-configured", modules: ["Router-Health", "Chat-Quota", "System-Status"] };
  }
}

export type CrmSnapshot =
  | { status: "ok"; totalContacts: number; contactsCreatedLast24h: number; salesforce: "ok" | "not-configured" }
  | { status: "not-configured" };

const HUBSPOT_CONTACTS_URL = "https://api.hubapi.com/crm/v3/objects/contacts";

/** CRM-Agent: HubSpot-Kontakte (Bearer-Token) + Salesforce-Konfigurationsstatus. */
export async function fetchCrmSnapshot(): Promise<CrmSnapshot> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) return { status: "not-configured" };
  const salesforce =
    process.env.SALESFORCE_INSTANCE_URL?.trim() && process.env.SALESFORCE_ACCESS_TOKEN?.trim() ? "ok" : "not-configured";
  try {
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [allResponse, recentResponse] = await Promise.all([
      fetchWithRetry(`${HUBSPOT_CONTACTS_URL}?limit=100&properties=createdate&propertiesWithHistory=createdate`, 1, token),
      fetchWithRetry(`${HUBSPOT_CONTACTS_URL}?limit=100&properties=createdate`, 1, token, undefined, dayAgoIso),
    ]);
    const countPages = (payload: unknown): number => {
      if (!payload || typeof payload !== "object") return 0;
      const results = (payload as Record<string, unknown>).results;
      const paging = (payload as Record<string, unknown>).paging;
      // HubSpot liefert 'total' nur bei expliziter Anfrage; wir zaehlen konservativ
      // die gelieferten Ergebnisse plus Paging-Hinweis.
      const direct = Number((payload as Record<string, unknown>).total);
      if (Number.isFinite(direct) && direct > 0) return direct;
      return Array.isArray(results) ? results.length + (paging ? 100 : 0) : 0;
    };
    const totalContacts = countPages(allResponse);
    const recentRaw = recentResponse as { results?: { properties?: { createdate?: string } }[] } | null;
    const contactsCreatedLast24h = (recentRaw?.results ?? []).filter(
      (contact) => contact.properties?.createdate && contact.properties.createdate >= dayAgoIso,
    ).length;
    console.log(`[DataHub] CRM-Snapshot: ${totalContacts} Kontakte, ${contactsCreatedLast24h} in 24 h.`);
    return { status: "ok", totalContacts, contactsCreatedLast24h, salesforce };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "HubSpot-Fehler.";
    console.warn(`[DataHub] CRM-Snapshot fehlgeschlagen: ${message}`);
    return { status: "not-configured" };
  }
}

export type ContentChannelStatus = { name: string; status: "ok" | "not-configured"; detail?: string };
export type ContentSnapshot = { channels: ContentChannelStatus[] };

/** Content-Agent: TikTok Content-Posting-API + Instagram Graph (Follower). */
export async function fetchContentSnapshot(): Promise<ContentSnapshot> {
  const channels: ContentChannelStatus[] = [];
  const tiktokKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  channels.push({
    name: "TikTok",
    status: tiktokKey ? "ok" : "not-configured",
    detail: tiktokKey ? "Content-Posting-API-Zugang konfiguriert (User-Access-Token fuer Veroeffentlichungen noetig)" : undefined,
  });
  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!instagramToken) {
    channels.push({ name: "Instagram", status: "not-configured" });
  } else {
    try {
      const raw = await fetchWithRetry(
        `https://graph.instagram.com/me?fields=username,followers_count&access_token=${encodeURIComponent(instagramToken)}`,
        1,
      );
      const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const username = typeof record.username === "string" ? record.username : "unbekannt";
      const followers = Number(record.followers_count);
      channels.push({
        name: "Instagram",
        status: "ok",
        detail: Number.isFinite(followers) ? `@${username} · ${followers} Follower` : `@${username}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 120) : "Instagram-Fehler.";
      console.warn(`[DataHub] Instagram-Status fehlgeschlagen: ${message}`);
      channels.push({ name: "Instagram", status: "not-configured" });
    }
  }
  return { channels };
}

export type AiServiceStatus = { name: string; configured: boolean };
export type AiServicesSnapshot = { services: AiServiceStatus[] };

/** KI-Dienste-Status (Perplexity, ElevenLabs, TikTok Symphony) — Key-Pruefung ohne Netzaufruf. */
export function fetchAiServicesSnapshot(): AiServicesSnapshot {
  return {
    services: [
      { name: "Perplexity (Recherche)", configured: Boolean(process.env.PERPLEXITY_API_KEY?.trim()) },
      { name: "ElevenLabs (Sprachausgabe)", configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) },
      { name: "TikTok Symphony (Content-KI)", configured: Boolean(process.env.TIKTOK_SYMPHONY_API_KEY?.trim()) },
    ],
  };
}

export const dataHubRouter = router({
  /** Aggregierter Dashboard-Snapshot: Revenue + Trading + Systemstatus. */
  dashboard: protectedProcedure.query(async () => {
    const [revenue, trading, analytics, crm, content, aiServices] = await Promise.all([
      fetchRevenueSnapshot(),
      fetchTradingSnapshot(),
      fetchAnalyticsSnapshot(),
      fetchCrmSnapshot(),
      fetchContentSnapshot(),
      Promise.resolve(fetchAiServicesSnapshot()),
    ]);
    const recentErrors = getRuntimeLogs()
      .filter((entry) => entry.level === "error")
      .slice(-3)
      .map((entry) => entry.message.slice(0, 120));
    return {
      revenue,
      trading,
      analytics,
      crm,
      content,
      aiServices,
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
export type BusinessTool =
  | "get_revenue_metrics"
  | "get_crypto_prices"
  | "get_analytics_overview"
  | "get_crm_contacts"
  | "get_content_channels_status"
  | "get_ai_services_status";

export async function executeBusinessSnapshot(tool: BusinessTool): Promise<unknown> {
  if (tool === "get_revenue_metrics") return fetchRevenueSnapshot();
  if (tool === "get_crypto_prices") return fetchTradingSnapshot();
  if (tool === "get_analytics_overview") return fetchAnalyticsSnapshot();
  if (tool === "get_crm_contacts") return fetchCrmSnapshot();
  if (tool === "get_content_channels_status") return fetchContentSnapshot();
  return fetchAiServicesSnapshot();
}

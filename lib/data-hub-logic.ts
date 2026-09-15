/**
 * Sprint 90 — Master-Agenten-Daten-Hub: reine, deterministische Logik fuer
 * die Business-Sub-Agenten (Revenue, Trading, Analytics, CRM, Content).
 *
 * Der Master-Agent (Chat) dekomponiert Anfragen wie "Zeige meine heutigen
 * Einnahmen" und delegiert an den passenden Sub-Agenten; die Sub-Agenten
 * holen echte Daten ueber die offiziellen APIs (Stripe SDK im Server,
 * Binance oeffentliche REST-API). Dieses Modul entscheidet rein:
 *   - welcher Business-Bereich fuer einen Prompt zustaendig ist
 *   - wie API-Antworten normalisiert werden (Binance-Ticker)
 *   - wie Werte deutsch formatiert werden ("1.248,32 €")
 *   - wann selbstheilende Retries sinnvoll sind (Backoff-Politik)
 */
import { formatRevenueOsSnapshot, type RevenueOsSnapshot } from "./revenue-os-logic";


/* ==================== Domänen-Routing ==================== */

export type BusinessDomain = "revenue" | "trading" | "analytics" | "crm" | "content" | "general";

const DOMAIN_KEYWORDS: Record<Exclude<BusinessDomain, "general">, string[]> = {
  revenue: ["einnahmen", "umsatz", "revenue", "abrechnung", "abonnement", "subscription", "stripe", "mrr", "zahlungen", "euro verdient", "affiliate", "provision", "partnerprogramm", "revenue-os"],
  trading: ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "kurs", "krypto", "crypto", "trading", "preis von", "binance", "kraken"],
  analytics: ["kampagne", "conversion", "konversion", "analytics", "traffic", "besucher", "ga4", "performance", "reichweite"],
  crm: ["kunden", "crm", "leads", "hubspot", "salesforce", "kontakte", "kundenliste"],
  content: ["content", "post", "instagram", "tiktok", "social media", "veroeffentlichen", "video", "reel", "perplexity", "recherche", "elevenlabs", "sprachausgabe", "stimme", "symphony"],
};

/**
 * Klassifiziert, welcher Sub-Agent fuer einen Prompt zustaendig ist.
 * Erster Treffer gewinnt (revenue vor trading, damit "Einnahmen aus BTC-
 * Verkaeufen" beim Revenue-Agenten landet).
 */
export function classifyBusinessDomain(prompt: string): BusinessDomain {
  const normalized = prompt.toLowerCase();
  for (const domain of ["revenue", "trading", "analytics", "crm", "content"] as const) {
    if (DOMAIN_KEYWORDS[domain].some((keyword) => normalized.includes(keyword))) {
      return domain;
    }
  }
  return "general";
}

/* ==================== Crypto-Ticker (Binance) ==================== */

export type CryptoTicker = {
  symbol: string;
  /** Preis in US-Dollar. */
  priceUsd: number;
  /** 24h Veraenderung in Prozent. */
  changePercent: number;
  fetchedAt: string;
};

const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

export function getBinanceSymbols(): string[] {
  return [...BINANCE_SYMBOLS];
}

/**
 * Normalisiert eine Binance-24h-Ticker-Antwort
 * ({ symbol, lastPrice, priceChangePercent }) in ein typsicheres Objekt.
 * Ungueltige Eintraege werden verworfen (null), statt die ganze Abfrage
 * reissen zu lassen.
 */
export function normalizeCryptoTicker(raw: unknown): CryptoTicker | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const symbol = typeof record.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
  const lastPrice = Number(record.lastPrice);
  const changePercent = Number(record.priceChangePercent);
  if (!symbol || !Number.isFinite(lastPrice) || lastPrice <= 0) return null;
  return {
    symbol,
    priceUsd: Number(lastPrice.toFixed(2)),
    changePercent: Number.isFinite(changePercent) ? Number(changePercent.toFixed(2)) : 0,
    fetchedAt: new Date().toISOString(),
  };
}


/* ==================== Kraken-Fallback (Trading) ==================== */

const KRAKEN_PAIRS = [
  { pair: "XXBTZUSD", symbol: "BTCUSDT" },
  { pair: "XETHZUSD", symbol: "ETHUSDT" },
  { pair: "SOLUSD", symbol: "SOLUSDT" },
] as const;

export type KrakenPair = (typeof KRAKEN_PAIRS)[number];

export function getKrakenPairs(): KrakenPair[] {
  return [...KRAKEN_PAIRS];
}

/**
 * Normalisiert eine Kraken-Ticker-Antwort
 * ({ error: [], result: { XXBTZUSD: { a: [ask], b: [bid], c: [lastTrade], o: [todayOpen] } } })
 * in ein typsicheres CryptoTicker-Objekt. Die 24h-Veraenderung wird aus
 * Tageseroeffnung (o) vs. letztem Handel (c) abgeleitet — das entspricht
 * dem Geist der Binance-Metrik, ohne eine zusaetzliche Abfrage zu benoetigen.
 */
export function normalizeKrakenTicker(pair: KrakenPair, raw: unknown): CryptoTicker | null {
  if (!raw || typeof raw !== "object") return null;
  const result = (raw as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return null;
  const entry = (result as Record<string, unknown>)[pair.pair];
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const lastTrade = Array.isArray(record.c) ? Number(record.c[0]) : NaN;
  const todayOpen = Array.isArray(record.o) ? Number(record.o[0]) : NaN;
  if (!Number.isFinite(lastTrade) || lastTrade <= 0) return null;
  const changePercent =
    Number.isFinite(todayOpen) && todayOpen > 0 ? Number((((lastTrade - todayOpen) / todayOpen) * 100).toFixed(2)) : 0;
  return {
    symbol: pair.symbol,
    priceUsd: Number(lastTrade.toFixed(2)),
    changePercent,
    fetchedAt: new Date().toISOString(),
  };
}


/* ==================== CoinGecko-Fallback (Trading) ==================== */

const COINGECKO_IDS = [
  { id: "bitcoin", symbol: "BTCUSDT" },
  { id: "ethereum", symbol: "ETHUSDT" },
  { id: "solana", symbol: "SOLUSDT" },
] as const;

export type CoinGeckoId = (typeof COINGECKO_IDS)[number];

export function getCoinGeckoIds(): CoinGeckoId[] {
  return [...COINGECKO_IDS];
}

/**
 * Normalisiert eine CoinGecko-"simple/price"-Antwort
 * ({ bitcoin: { usd: 61234.5, usd_24h_change: 1.23 }, ... }) in ein
 * typsicheres CryptoTicker-Objekt. Letzter Fallback nach Binance und
 * Kraken — CoinGecko benoetigt keinen API-Key und ist selten geo-blockiert.
 */
export function normalizeCoinGeckoTicker(entry: CoinGeckoId, raw: unknown): CryptoTicker | null {
  if (!raw || typeof raw !== "object") return null;
  const record = (raw as Record<string, unknown>)[entry.id];
  if (!record || typeof record !== "object") return null;
  const coin = record as Record<string, unknown>;
  const priceUsd = Number(coin.usd);
  const changePercent = Number(coin.usd_24h_change);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return {
    symbol: entry.symbol,
    priceUsd: Number(priceUsd.toFixed(2)),
    changePercent: Number.isFinite(changePercent) ? Number(changePercent.toFixed(2)) : 0,
    fetchedAt: new Date().toISOString(),
  };
}

/* ==================== Formatierung ==================== */

/** Deutsch formatierte Ganzzahl mit Tausenderpunkten: 1248 -> "1.248". */
export function formatGermanNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return safe.toLocaleString("de-DE");
}

/** Deutsch formatierter Waehrungsbetrag: 1248.32 -> "1.248,32 €". */
export function formatCurrency(value: number, currency: "EUR" | "USD" = "EUR"): string {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = safe.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${currency === "EUR" ? "€" : "$"}`;
}

/** Formatiert einen Krypto-Preis kompakt ("BTC: 61.234,50 $"). */
export function formatCryptoLine(ticker: CryptoTicker): string {
  const sign = ticker.changePercent >= 0 ? "+" : "";
  return `${ticker.symbol.replace("USDT", "")}: ${formatCurrency(ticker.priceUsd, "USD")} (${sign}${ticker.changePercent} % 24h)`;
}


/* ==================== GA4-Report (Analytics) ==================== */

export type Ga4Metrics = {
  activeUsers: number;
  sessions: number;
  conversions: number;
  fetchedAt: string;
};

/**
 * Normalisiert die Zeilen einer GA4-Data-API-runReport-Antwort
 * ({ rows: [{ metricValues: [{ value }, ...] }] }) in ein typsicheres
 * Objekt. Ungueltige/fehlende Werte zaehlen als 0 statt den Report zu reissen.
 */
export function normalizeGa4Report(raw: unknown): Ga4Metrics | null {
  if (!raw || typeof raw !== "object") return null;
  const rows = (raw as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return null;
  const sums = { activeUsers: 0, sessions: 0, conversions: 0 };
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const metricValues = (row as Record<string, unknown>).metricValues;
    if (!Array.isArray(metricValues)) continue;
    const pick = (index: number): number => {
      const value = metricValues[index];
      const parsed = value && typeof value === "object" ? Number((value as Record<string, unknown>).value) : NaN;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    sums.activeUsers += pick(0);
    sums.sessions += pick(1);
    sums.conversions += pick(2);
  }
  return { ...sums, fetchedAt: new Date().toISOString() };
}

/* ==================== Selbstheilung: Retry-Politik ==================== */

export const MAX_RETRY_ATTEMPTS = 2;

/**
 * Backoff-Dauer fuer selbstheilende Retries: 500 ms * 2^attempt,
 * gedeckelt bei 4 s (mobile Nutzer erwarten keine ewigen Wartezeiten).
 */
export function computeRetryDelayMs(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt));
  return Math.min(4_000, 500 * 2 ** safe);
}

/** True bei transienten Fehlern (5xx, 429, Netzwerk), false bei 4xx-Fehlern. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/* ==================== Business-Tool-Schemas (Master-Agent) ==================== */

/** Nur-Lese-Business-Tools des Master-Agenten — keine schreibenden Aktionen. */
export const BUSINESS_TOOL_NAMES = [
  "get_revenue_metrics",
  "get_crypto_prices",
  "get_analytics_overview",
  "get_crm_contacts",
  "get_content_channels_status",
  "get_ai_services_status",
  "get_revenue_os_overview",
] as const;

export type BusinessToolName = (typeof BUSINESS_TOOL_NAMES)[number];

export function isBusinessToolName(value: string): value is BusinessToolName {
  return (BUSINESS_TOOL_NAMES as readonly string[]).includes(value);
}

/** Kurzbeschreibung je Tool fuer das Modell (Beschreibung hier, Schema im Server). */
export const BUSINESS_TOOL_DESCRIPTIONS: Record<BusinessToolName, string> = {
  get_revenue_metrics:
    "Liefert Live-Einnahmen aus Stripe: Gesamtbetrag (Balance), Zahlungen der letzten 24 h und aktive Abonnements. Voraussetzung: STRIPE_SECRET_KEY ist konfiguriert.",
  get_crypto_prices:
    "Liefert Echtzeit-Kurse fuer BTC, ETH und SOL (Binance oeffentliche API, 24h-Veraenderung). Kein API-Key noetig.",
  get_analytics_overview:
    "Liefert Analytics-Kennzahlen (GA4: aktive Nutzer, Sitzungen, Conversions der letzten 7 Tage). Voraussetzung: GA4_PROPERTY_ID + GA4_ACCESS_TOKEN konfiguriert; sonst klarer Nicht-Konfiguriert-Status.",
  get_crm_contacts:
    "Liefert CRM-Kennzahlen: HubSpot-Kontakte und -Neukunden (letzte 24 h) sowie den Konfigurationsstatus von Salesforce. Voraussetzung: HUBSPOT_ACCESS_TOKEN.",
  get_content_channels_status:
    "Liefert den Status der Content-Kanaele: TikTok (Content-Posting-API) und Instagram (Profil, Follower). Voraussetzung: TIKTOK-/INSTAGRAM-Zugangsdaten.",
  get_ai_services_status:
    "Liefert den Status der KI-Dienste (Perplexity Recherche, ElevenLabs Sprachausgabe, TikTok Symphony) — verfuegbar, sobald die jeweiligen API-Keys hinterlegt sind.",
  get_revenue_os_overview:
    "Liefert einen read-only-Ueberblick ueber das Schwestersystem Revenue-OS: Umsatz und Transaktionen (24 h, gesamt), Content-Status je Eintrag, Affiliate-Klicks/-Konversionen/Provisionen und aktive Subscriptions. Voraussetzung: REVENUE_OS_DATABASE_URL (getrenntes Secret).",
};

/** Formatiert das Ergebnis eines Business-Tools als kompakte Modell-Antwort. */
export function formatBusinessResult(tool: BusinessToolName, payload: unknown): string {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (tool === "get_revenue_os_overview") {
    return formatRevenueOsSnapshot(payload as RevenueOsSnapshot);
  }
  if (tool === "get_crypto_prices") {
    const tickers = Array.isArray(record.tickers) ? (record.tickers as CryptoTicker[]) : [];
    if (tickers.length === 0) return "Krypto-Kurse sind derzeit nicht verfuegbar.";
    return tickers.map(formatCryptoLine).join("\n");
  }
  if (tool === "get_revenue_metrics") {
    if (record.status === "not-configured") {
      return "Stripe ist auf dem Server nicht konfiguriert (STRIPE_SECRET_KEY fehlt). Bitte in den Umgebungsvariablen hinterlegen.";
    }
    const total = formatCurrency(Number(record.totalBalanceEur ?? 0));
    const last24h = formatCurrency(Number(record.revenueLast24hEur ?? 0));
    return `Einnahmen: Gesamtbalance ${total}, letzte 24 h ${last24h}, aktive Abonnements: ${String(record.activeSubscriptions ?? 0)}.`;
  }
  if (tool === "get_analytics_overview") {
    if (record.status === "ok") {
      const users = Number(record.activeUsers ?? 0);
      const sessions = Number(record.sessions ?? 0);
      const conversions = Number(record.conversions ?? 0);
      const rate = sessions > 0 ? ((conversions / sessions) * 100).toFixed(2).replace(".", ",") : "0";
      return `GA4 (7 Tage): ${formatGermanNumber(users)} aktive Nutzer, ${formatGermanNumber(sessions)} Sitzungen, ${formatGermanNumber(conversions)} Conversions (Konversionsrate ${rate} %).`;
    }
    const modules = Array.isArray(record.modules) ? (record.modules as string[]) : [];
    return `Analytics-Uebersicht: verfuegbare Module: ${modules.length > 0 ? modules.join(", ") : "keine"}. GA4 wird aktiv, sobald GA4_PROPERTY_ID + GA4_ACCESS_TOKEN hinterlegt sind.`;
  }
  if (tool === "get_crm_contacts") {
    if (record.status === "ok") {
      const total = Number(record.totalContacts ?? 0);
      const recent = Number(record.contactsCreatedLast24h ?? 0);
      const salesforce = String(record.salesforce ?? "not-configured");
      return `CRM: ${formatGermanNumber(total)} HubSpot-Kontakte, ${formatGermanNumber(recent)} Neukontakte in den letzten 24 h; Salesforce: ${salesforce === "ok" ? "verbunden" : "nicht konfiguriert"}.`;
    }
    return "CRM ist auf dem Server nicht konfiguriert (HUBSPOT_ACCESS_TOKEN fehlt). Bitte in den Umgebungsvariablen hinterlegen.";
  }
  if (tool === "get_content_channels_status") {
    const channels = Array.isArray(record.channels)
      ? (record.channels as { name: string; status: string; detail?: string }[]).map(
          (channel) => `${channel.name}: ${channel.status === "ok" ? channel.detail ?? "verbunden" : "nicht konfiguriert"}`,
        )
      : [];
    return `Content-Kanaele — ${channels.length > 0 ? channels.join("; ") : "keine Kanaele konfiguriert"}.`;
  }
  // get_ai_services_status
  const services = Array.isArray(record.services)
    ? (record.services as { name: string; configured: boolean }[]).map(
        (service) => `${service.name}: ${service.configured ? "verfuegbar" : "Key fehlt"}`,
      )
    : [];
  return `KI-Dienste — ${services.length > 0 ? services.join("; ") : "keine Dienste registriert"}.`;
}

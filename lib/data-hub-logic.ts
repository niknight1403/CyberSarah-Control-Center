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

/* ==================== Domänen-Routing ==================== */

export type BusinessDomain = "revenue" | "trading" | "analytics" | "crm" | "content" | "general";

const DOMAIN_KEYWORDS: Record<Exclude<BusinessDomain, "general">, string[]> = {
  revenue: ["einnahmen", "umsatz", "revenue", "abrechnung", "abonnement", "subscription", "stripe", "mrr", "zahlungen", "euro verdient"],
  trading: ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "kurs", "krypto", "crypto", "trading", "preis von", "binance"],
  analytics: ["kampagne", "conversion", "konversion", "analytics", "traffic", "besucher", "ga4", "performance", "reichweite"],
  crm: ["kunden", "crm", "leads", "hubspot", "salesforce", "kontakte", "kundenliste"],
  content: ["content", "post", "instagram", "tiktok", "social media", "veroeffentlichen", "video", "reel"],
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

/* ==================== Formatierung ==================== */

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
export const BUSINESS_TOOL_NAMES = ["get_revenue_metrics", "get_crypto_prices", "get_analytics_overview"] as const;

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
    "Liefert den System-Status der Analytics-Integrationen (verfuegbare Module, Aktivitaet). Externe Analytics-APIs (GA4) muessen zusaetzlich konfiguriert werden.",
};

/** Formatiert das Ergebnis eines Business-Tools als kompakte Modell-Antwort. */
export function formatBusinessResult(tool: BusinessToolName, payload: unknown): string {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
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
  // get_analytics_overview
  const modules = Array.isArray(record.modules) ? (record.modules as string[]) : [];
  return `Analytics-Uebersicht: verfuegbare Module: ${modules.length > 0 ? modules.join(", ") : "keine"}. Externe Kampagnen-APIs (GA4, TikTok) benoetigen zusaetzliche Zugangsdaten.`;
}

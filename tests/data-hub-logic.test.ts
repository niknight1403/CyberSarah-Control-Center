import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOOL_NAMES,
  classifyBusinessDomain,
  computeRetryDelayMs,
  formatBusinessResult,
  formatCryptoLine,
  formatCurrency,
  getBinanceSymbols,
  getKrakenPairs,
  getCoinGeckoIds,
  isBusinessToolName,
  isRetryableStatus,
  normalizeCryptoTicker,
  normalizeGa4Report,
  normalizeKrakenTicker,
  normalizeCoinGeckoTicker,
} from "../lib/data-hub-logic";

describe("data-hub-logic (Sprint 90)", () => {
  it("routes Business-Prompts an den zustaendigen Sub-Agenten", () => {
    expect(classifyBusinessDomain("Zeige meine heutigen Einnahmen")).toBe("revenue");
    expect(classifyBusinessDomain("Wie ist der Bitcoin-Kurs gerade?")).toBe("trading");
    expect(classifyBusinessDomain("Wie laeuft die Kampagne / Konversionsrate?")).toBe("analytics");
    expect(classifyBusinessDomain("Wie viele Kunden haben wir im CRM?")).toBe("crm");
    expect(classifyBusinessDomain("Poste die Content-Idee auf Instagram")).toBe("content");
    expect(classifyBusinessDomain("Erklaere mir Exponentialfunktionen")).toBe("general");
    // Revenue schlaegt Trading (Einnahmen-Frage geht an den Revenue-Agenten)
    expect(classifyBusinessDomain("Einnahmen aus BTC-Verkaeufen anzeigen")).toBe("revenue");
  });

  it("normalisiert Binance-Ticker deterministisch und verwirft Muell", () => {
    const ticker = normalizeCryptoTicker({ symbol: "btcusdt ", lastPrice: "61234.5", priceChangePercent: "-1.234" });
    expect(ticker).toEqual({ symbol: "BTCUSDT", priceUsd: 61234.5, changePercent: -1.23, fetchedAt: ticker?.fetchedAt });
    expect(normalizeCryptoTicker({ symbol: "X", lastPrice: "abc" })).toBeNull();
    expect(normalizeCryptoTicker(null)).toBeNull();
    expect(normalizeCryptoTicker({ symbol: "BTCUSDT", lastPrice: "-5" })).toBeNull();
    expect(getBinanceSymbols()).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  });

  it("formatiert Waehrungen und Krypto-Zeilen deutsch", () => {
    expect(formatCurrency(1248.32)).toBe("1.248,32 €");
    expect(formatCurrency(0, "USD")).toBe("0,00 $");
    expect(formatCurrency(Number.NaN)).toBe("0,00 €");
    expect(formatCryptoLine({ symbol: "BTCUSDT", priceUsd: 61234.5, changePercent: 1.5, fetchedAt: "" })).toBe(
      "BTC: 61.234,50 $ (+1.5 % 24h)",
    );
  });

  it("implementiert die selbstheilende Retry-Politik (Backoff, gedeckelt)", () => {
    expect(computeRetryDelayMs(0)).toBe(500);
    expect(computeRetryDelayMs(1)).toBe(1_000);
    expect(computeRetryDelayMs(2)).toBe(2_000);
    expect(computeRetryDelayMs(5)).toBe(4_000); // Deckel
    expect(computeRetryDelayMs(-3)).toBe(500);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  it("kennt genau die sechs Business-Tools und formatiert deren Ergebnisse", () => {
    expect(BUSINESS_TOOL_NAMES).toEqual([
      "get_revenue_metrics",
      "get_crypto_prices",
      "get_analytics_overview",
      "get_crm_contacts",
      "get_content_channels_status",
      "get_ai_services_status",
    ]);
    expect(isBusinessToolName("get_crypto_prices")).toBe(true);
    expect(isBusinessToolName("delete_repo")).toBe(false);

    expect(formatBusinessResult("get_revenue_metrics", { status: "not-configured" })).toMatch(/STRIPE_SECRET_KEY/);
    expect(
      formatBusinessResult("get_revenue_metrics", { status: "ok", totalBalanceEur: 1248.32, revenueLast24hEur: 99.5, activeSubscriptions: 7 }),
    ).toContain("1.248,32 €");
    expect(formatBusinessResult("get_crypto_prices", { tickers: [] })).toMatch(/nicht verfuegbar/);
    expect(
      formatBusinessResult("get_crypto_prices", { tickers: [{ symbol: "BTCUSDT", priceUsd: 60000, changePercent: -2, fetchedAt: "" }] }),
    ).toContain("BTC: 60.000,00 $");
    expect(formatBusinessResult("get_analytics_overview", { modules: ["Router-Health"] })).toContain("Router-Health");
  });

  it("erweitert den Sub-Agenten-Routing um GA4-, CRM-, Content- und KI-Prompts (Sprint 93)", () => {
    expect(classifyBusinessDomain("Hole die GA4-Zahlen der letzten Woche")).toBe("analytics");
    expect(classifyBusinessDomain("Recherchiere den Trend mit Perplexity")).toBe("content");
    expect(classifyBusinessDomain("Wie steht der Kurs auf Kraken?")).toBe("trading");
  });

  it("formatiert GA4-Ergebnisse mit Konversionsrate und Nicht-Konfiguriert-Hinweis", () => {
    expect(formatBusinessResult("get_analytics_overview", { status: "ok", activeUsers: 421, sessions: 1200, conversions: 39 })).toBe(
      "GA4 (7 Tage): 421 aktive Nutzer, 1.200 Sitzungen, 39 Conversions (Konversionsrate 3,25 %).",
    );
    expect(formatBusinessResult("get_analytics_overview", { status: "not-configured", modules: ["Router-Health"] })).toMatch(/GA4_PROPERTY_ID/);
  });

  it("formatiert CRM-, Content- und KI-Dienste-Ergebnisse", () => {
    expect(
      formatBusinessResult("get_crm_contacts", { status: "ok", totalContacts: 1248, contactsCreatedLast24h: 3, salesforce: "not-configured" }),
    ).toContain("1.248 HubSpot-Kontakte");
    expect(formatBusinessResult("get_crm_contacts", { status: "not-configured" })).toMatch(/HUBSPOT_ACCESS_TOKEN/);
    expect(
      formatBusinessResult("get_content_channels_status", {
        channels: [
          { name: "TikTok", status: "ok", detail: "konfiguriert" },
          { name: "Instagram", status: "not-configured" },
        ],
      }),
    ).toContain("TikTok: konfiguriert");
    expect(
      formatBusinessResult("get_ai_services_status", {
        services: [
          { name: "Perplexity (Recherche)", configured: true },
          { name: "ElevenLabs (Sprachausgabe)", configured: false },
        ],
      }),
    ).toContain("Perplexity (Recherche): verfuegbar");
  });

  it("normalisiert Kraken-Ticker (Fallback-Quelle) und GA4-Reports deterministisch", () => {
    const pairs = getKrakenPairs();
    expect(pairs).toHaveLength(3);
    const kraken = normalizeKrakenTicker(pairs[0], {
      error: [],
      result: { XXBTZUSD: { a: ["61000.0"], b: ["60990.0"], c: ["61200.5"], o: ["60500.0"] } },
    });
    expect(kraken).toMatchObject({ symbol: "BTCUSDT", priceUsd: 61200.5, changePercent: 1.16 });
    expect(normalizeKrakenTicker(pairs[0], { error: ["EQuery:Unknown pair"], result: {} })).toBeNull();
    expect(normalizeKrakenTicker(pairs[0], null)).toBeNull();

    const coinGeckoIds = getCoinGeckoIds();
    expect(coinGeckoIds).toHaveLength(3);
    const coinGecko = normalizeCoinGeckoTicker(coinGeckoIds[0], { bitcoin: { usd: 61234.5, usd_24h_change: 1.234 } });
    expect(coinGecko).toMatchObject({ symbol: "BTCUSDT", priceUsd: 61234.5, changePercent: 1.23 });
    expect(normalizeCoinGeckoTicker(coinGeckoIds[0], { bitcoin: { usd: 0 } })).toBeNull();
    expect(normalizeCoinGeckoTicker(coinGeckoIds[0], null)).toBeNull();

    const ga4 = normalizeGa4Report({
      rows: [
        { metricValues: [{ value: "300" }, { value: "800" }, { value: "20" }] },
        { metricValues: [{ value: "121" }, { value: "400" }, { value: "19" }] },
      ],
    });
    expect(ga4).toMatchObject({ activeUsers: 421, sessions: 1200, conversions: 39 });
    expect(normalizeGa4Report({})).toBeNull();
    expect(normalizeGa4Report({ rows: "keine liste" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOOL_NAMES,
  classifyBusinessDomain,
  computeRetryDelayMs,
  formatBusinessResult,
  formatCryptoLine,
  formatCurrency,
  getBinanceSymbols,
  isBusinessToolName,
  isRetryableStatus,
  normalizeCryptoTicker,
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

  it("kennt genau die drei Business-Tools und formatiert deren Ergebnisse", () => {
    expect(BUSINESS_TOOL_NAMES).toEqual(["get_revenue_metrics", "get_crypto_prices", "get_analytics_overview"]);
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
});

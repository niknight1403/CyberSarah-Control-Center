/**
 * Sprint 114 — Revenue-OS (read-only): deterministische Tests der reinen
 * Logik — Normalisierung, Snapshot-Aufbau, Formatierung, Fehlerklassifikation
 * und die Nur-Lese-Garantie der SQL-Konstanten. Keine Datenbank, kein Netz.
 */
import { describe, expect, it } from "vitest";

import {
  buildRevenueOsSnapshot,
  describeRevenueOsError,
  formatRevenueOsSnapshot,
  REVENUE_OS_QUERIES,
  toNumber,
  type RevenueOsQueryResults,
} from "../lib/revenue-os-logic";
import { classifyBusinessDomain } from "../lib/data-hub-logic";

function emptyResults(): RevenueOsQueryResults {
  return {
    transactionsLast24h: { rows: [] },
    transactionsTotal: { rows: [] },
    topQuelleLast7d: { rows: [] },
    contentByStatus: { rows: [] },
    affiliateTotals: { rows: [] },
    activeSubscriptions: { rows: [] },
  };
}

describe("Sprint 114: Normalisierung", () => {
  it("numeric-Strings und Zahlen werden zu Zahlen, Muell zu 0", () => {
    expect(toNumber("1234.56")).toBe(1234.56);
    expect(toNumber(42)).toBe(42);
    expect(toNumber(null)).toBe(0);
    expect(toNumber("keine Zahl")).toBe(0);
    expect(toNumber("")).toBe(0);
  });
});

describe("Sprint 114: Snapshot-Aufbau", () => {
  it("leere Datenbank liefert Null-Snapshot ohne Absturz", () => {
    const snapshot = buildRevenueOsSnapshot(emptyResults(), "2026-09-15T00:00:00.000Z");
    expect(snapshot.status).toBe("ok");
    expect(snapshot.revenueLast24hEur).toBe(0);
    expect(snapshot.transactionsLast24h).toBe(0);
    expect(snapshot.totalRevenueEur).toBe(0);
    expect(snapshot.topQuelle).toBe("keine Daten");
    expect(snapshot.contentByStatus).toEqual({});
    expect(snapshot.affiliateClicks).toBe(0);
    expect(snapshot.activeSubscriptions).toBe(0);
  });

  it("volle Rohdaten werden korrekt normalisiert", () => {
    const results = emptyResults();
    results.transactionsLast24h = { rows: [{ sum_eur: "149.95", count: 3 }] };
    results.transactionsTotal = { rows: [{ sum_eur: 4210.5 }] };
    results.topQuelleLast7d = { rows: [{ quelle: "stripe" }] };
    results.contentByStatus = {
      rows: [
        { status: "entwurf", count: 4 },
        { status: "veroeffentlicht", count: 12 },
      ],
    };
    results.affiliateTotals = { rows: [{ clicks: 845, conversions: 23, provision: "310.40", active_partners: 5 }] };
    results.activeSubscriptions = { rows: [{ count: 17 }] };

    const snapshot = buildRevenueOsSnapshot(results, "2026-09-15T00:00:00.000Z");
    expect(snapshot.revenueLast24hEur).toBe(149.95);
    expect(snapshot.transactionsLast24h).toBe(3);
    expect(snapshot.totalRevenueEur).toBe(4210.5);
    expect(snapshot.topQuelle).toBe("stripe");
    expect(snapshot.contentByStatus).toEqual({ entwurf: 4, veroeffentlicht: 12 });
    expect(snapshot.affiliateClicks).toBe(845);
    expect(snapshot.affiliateConversions).toBe(23);
    expect(snapshot.provisionSummeEur).toBe(310.4);
    expect(snapshot.activePartners).toBe(5);
    expect(snapshot.activeSubscriptions).toBe(17);
  });

  it("NULL-Spalten fallen auf 0 zurueck, nicht auf NaN", () => {
    const results = emptyResults();
    results.transactionsLast24h = { rows: [{ sum_eur: null, count: null }] };
    results.affiliateTotals = { rows: [{ clicks: null, conversions: null, provision: null, active_partners: null }] };
    const snapshot = buildRevenueOsSnapshot(results);
    expect(snapshot.revenueLast24hEur).toBe(0);
    expect(snapshot.transactionsLast24h).toBe(0);
    expect(snapshot.affiliateClicks).toBe(0);
    expect(snapshot.provisionSummeEur).toBe(0);
    expect(snapshot.activePartners).toBe(0);
  });
});

describe("Sprint 114: Formatierung", () => {
  it("not-configured nennt das fehlende Secret praezise", () => {
    const text = formatRevenueOsSnapshot({ status: "not-configured" });
    expect(text).toContain("REVENUE_OS_DATABASE_URL");
    expect(text).toContain("getrenntes Secret");
  });

  it("error-Zustand gibt die Ursache wieder", () => {
    const text = formatRevenueOsSnapshot({ status: "error", error: "Tabellen fehlen." });
    expect(text).toContain("Tabellen fehlen.");
  });

  it("ok-Snapshot wird deutsch und kompakt formatiert", () => {
    const results = emptyResults();
    results.transactionsLast24h = { rows: [{ sum_eur: "149.95", count: 3 }] };
    results.contentByStatus = { rows: [{ status: "veroeffentlicht", count: 12 }] };
    results.affiliateTotals = { rows: [{ clicks: 845, conversions: 23, provision: "310.40", active_partners: 5 }] };
    const text = formatRevenueOsSnapshot(buildRevenueOsSnapshot(results));
    expect(text).toContain("149,95");
    expect(text).toContain("845 Klicks");
    expect(text).toContain("12 veroeffentlicht");
    expect(text).toContain("read-only");
  });
});

describe("Sprint 114: Fehlerklassifikation", () => {
  it("fehlende Tabellen ergeben den Migrations-Hinweis", () => {
    expect(describeRevenueOsError('relation "transactions" does not exist')).toContain("Neon");
  });

  it("Auth-Fehler und Timeout werden erkannt", () => {
    expect(describeRevenueOsError("password authentication failed")).toContain("Zugangsdaten");
    expect(describeRevenueOsError("connect ETIMEDOUT")).toContain("nicht erreichbar");
    expect(describeRevenueOsError("connect ECONNREFUSED 1.2.3.4:5432")).toContain("nicht erreichbar");
  });

  it("unbekannte Fehler bleiben ehrlich generisch", () => {
    expect(describeRevenueOsError("irgendwas anderes")).toContain("Unerwarteter Fehler");
  });
});

describe("Sprint 114: Nur-Lese-Garantie", () => {
  it("alle SQL-Konstanten sind strikte SELECTs ohne Schreib-Schluesselwoerter", () => {
    for (const [name, sql] of Object.entries(REVENUE_OS_QUERIES)) {
      const normalized = sql.toLowerCase().replace(/\s+/g, " ");
      expect(normalized.startsWith("select")).toBe(true);
      for (const forbidden of ["insert", "update", "delete", "drop", "create", "alter", "grant", "copy"]) {
        // Wortgrenzen, damit Spalten wie created_at nicht faelschlich anschlagen.
        expect(new RegExp(`\\b${forbidden}\\b`).test(normalized)).toBe(false);
      }
      if (name === "topQuelleLast7d") {
        expect(normalized.includes("limit 1")).toBe(true);
      }
    }
  });
});

describe("Sprint 114: Routing", () => {
  it("Revenue-OS-Anfragen landen in der Revenue-Domaene", () => {
    expect(classifyBusinessDomain("Wie viele Affiliate-Klicks gab es?")).toBe("revenue");
    expect(classifyBusinessDomain("Zeig mir den Revenue-OS Umsatz")).toBe("revenue");
    expect(classifyBusinessDomain("Wie hoch ist die Provision im Partnerprogramm?")).toBe("revenue");
  });
});

/**
 * Sprint 114 — Revenue-OS-Integration (read-only): reine, deterministische
 * Logik fuer den Sub-Agenten, der die Datenbank des Schwestersystems
 * `cybersarah-revenue-os` (Postgres/Neon, Tabellen `transactions`,
 * `content`, `affiliate_partners`, `customer_subscriptions`) NUR LESEND
 * in den Master-Agenten-Daten-Hub einbindet.
 *
 * Konventionen (Roadmap Sprint 114):
 *   - strikt read-only: die SQL-Konstanten dieses Moduls enthalten nur
 *     SELECTs mit LIMIT-Deckeln; der Client setzt zusaetzlich die Session
 *     auf READ ONLY (server/revenue-os.ts)
 *   - Geheimnistrennung: die Revenue-OS-Datenbank wird ueber das eigene,
 *     getrennte Secret REVENUE_OS_DATABASE_URL angebunden — niemals ueber
 *     die DATABASE_URL des Control Centers
 *   - Schreib-Tools sind bewusst NICHT Teil dieses Sprints
 *
 * Dieses Modul entscheidet rein:
 *   - wie die rohen DB-Zeilen normalisiert werden (numeric→Zahl, NULL→0)
 *   - wie der Snapshot aussieht (Umsatz, Content-Status, Affiliate-Klicks)
 *   - wie der Snapshot fuer das Chat-Modell deutsch formatiert wird
 */

/* ==================== Typen ==================== */

export type RevenueOsSnapshot =
  | {
      status: "ok";
      /** Umsatz (EUR) der letzten 24 h aus `transactions`. */
      revenueLast24hEur: number;
      /** Transaktionsanzahl der letzten 24 h. */
      transactionsLast24h: number;
      /** Gesamtumsatz (EUR) aller Zeit aus `transactions`. */
      totalRevenueEur: number;
      /** Staerkste Quelle der letzten 7 Tage ("stripe", "digistore24", …). */
      topQuelle: string;
      /** Content-Eintraege je Status ("entwurf", "geplant", "veroeffentlicht", …). */
      contentByStatus: Record<string, number>;
      /** Gesamte Affiliate-Klicks ueber alle Partner. */
      affiliateClicks: number;
      /** Gesamte Affiliate-Konversionen. */
      affiliateConversions: number;
      /** Summe offene + ausgezahlte Provisionen (EUR) ueber alle Partner. */
      provisionSummeEur: number;
      /** Partner mit Status "aktiv". */
      activePartners: number;
      /** Aktive Kundensubscriptions (`customer_subscriptions`, status "aktiv"). */
      activeSubscriptions: number;
      fetchedAt: string;
    }
  | { status: "not-configured" }
  | { status: "error"; error: string };

/* ==================== Read-only SQL (bewusst hier, testbar) ==================== */

/**
 * Alle Abfragen gegen die Revenue-OS-Datenbank. Nur SELECTs, LIMIT-deckelt,
 * ohne Statistik- oder Schema-Zugriffe — der Test prueft die Nur-Lese-Eigenschaft.
 */
export const REVENUE_OS_QUERIES = {
  transactionsLast24h:
    "SELECT COALESCE(SUM(betrag), 0)::float8 AS sum_eur, COUNT(*)::int AS count FROM transactions WHERE waehrung = 'EUR' AND created_at >= NOW() - INTERVAL '24 hours'",
  transactionsTotal:
    "SELECT COALESCE(SUM(betrag), 0)::float8 AS sum_eur FROM transactions WHERE waehrung = 'EUR'",
  topQuelleLast7d:
    "SELECT quelle FROM transactions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY quelle ORDER BY SUM(betrag) DESC LIMIT 1",
  contentByStatus:
    "SELECT status, COUNT(*)::int AS count FROM content GROUP BY status",
  affiliateTotals:
    "SELECT COALESCE(SUM(klick_anzahl), 0)::int AS clicks, COALESCE(SUM(konversion_anzahl), 0)::int AS conversions, COALESCE(SUM(gesamt_provision), 0)::float8 AS provision, COUNT(*) FILTER (WHERE status = 'aktiv')::int AS active_partners FROM affiliate_partners",
  activeSubscriptions:
    "SELECT COUNT(*)::int AS count FROM customer_subscriptions WHERE status = 'aktiv'",
} as const;

/* ==================== Normalisierung (rein) ==================== */

/** Wandelt einen Postgres-numeric/float8-Wert sicher in eine Zahl. */
export function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Erste Zeile einer Abfrage als Record (oder {} bei leerem Result). */
function firstRow(rows: unknown[]): Record<string, unknown> {
  return rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null
    ? (rows[0] as Record<string, unknown>)
    : {};
}

export type RevenueOsQueryResults = {
  transactionsLast24h: { rows: unknown[] };
  transactionsTotal: { rows: unknown[] };
  topQuelleLast7d: { rows: unknown[] };
  contentByStatus: { rows: unknown[] };
  affiliateTotals: { rows: unknown[] };
  activeSubscriptions: { rows: unknown[] };
};

/** Rundet auf zwei Nachkommastellen (Geldbetrags-Konvention des Hubs). */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Baut den Snapshot aus den rohen Abfrageergebnissen — rein, ohne DB.
 * numeric-Spalten kommen als String oder Zahl (je nach Cast), NULL als null —
 * alles wird toleriert und zu 0 normalisiert.
 */
export function buildRevenueOsSnapshot(
  results: RevenueOsQueryResults,
  fetchedAt = new Date().toISOString(),
): Extract<RevenueOsSnapshot, { status: "ok" }> {
  const last24h = firstRow(results.transactionsLast24h.rows);
  const total = firstRow(results.transactionsTotal.rows);
  const quelle = firstRow(results.topQuelleLast7d.rows);
  const affiliate = firstRow(results.affiliateTotals.rows);
  const subscriptions = firstRow(results.activeSubscriptions.rows);

  const contentByStatus: Record<string, number> = {};
  for (const row of results.contentByStatus.rows) {
    if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      const status = typeof record.status === "string" ? record.status : "unbekannt";
      contentByStatus[status] = toNumber(record.count);
    }
  }

  return {
    status: "ok",
    revenueLast24hEur: money(toNumber(last24h.sum_eur)),
    transactionsLast24h: toNumber(last24h.count),
    totalRevenueEur: money(toNumber(total.sum_eur)),
    topQuelle: typeof quelle.quelle === "string" && quelle.quelle.length > 0 ? quelle.quelle : "keine Daten",
    contentByStatus,
    affiliateClicks: toNumber(affiliate.clicks),
    affiliateConversions: toNumber(affiliate.conversions),
    provisionSummeEur: money(toNumber(affiliate.provision)),
    activePartners: toNumber(affiliate.active_partners),
    activeSubscriptions: toNumber(subscriptions.count),
    fetchedAt,
  };
}

/* ==================== Formatierung (Modell-Antwort) ==================== */

function formatGermanNumber(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

function formatEur(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * Formatiert den Snapshot als kompakte, ehrliche Modell-Antwort — inklusive
 * der beiden Nicht-ok-Zustaende mit klarer Handlungsanweisung.
 */
export function formatRevenueOsSnapshot(snapshot: RevenueOsSnapshot): string {
  if (snapshot.status === "not-configured") {
    return "Die Revenue-OS-Datenbank ist noch nicht angebunden: Auf dem Server fehlt die Umgebungsvariable REVENUE_OS_DATABASE_URL (getrenntes Secret des Schwestersystems, nicht die DATABASE_URL des Control Centers).";
  }
  if (snapshot.status === "error") {
    return `Revenue-OS-Daten sind derzeit nicht abrufbar: ${snapshot.error}`;
  }
  const contentEntries = Object.entries(snapshot.contentByStatus);
  const contentLine =
    contentEntries.length > 0
      ? contentEntries.map(([status, count]) => `${count} ${status}`).join(", ")
      : "keine Inhalte vorhanden";
  return [
    `Revenue-OS (read-only): Umsatz letzte 24 h ${formatEur(snapshot.revenueLast24hEur)} aus ${formatGermanNumber(snapshot.transactionsLast24h)} Transaktionen.`,
    `Gesamtumsatz ${formatEur(snapshot.totalRevenueEur)}, staerkste Quelle (7 Tage): ${snapshot.topQuelle}.`,
    `Content-Status: ${contentLine}.`,
    `Affiliate: ${formatGermanNumber(snapshot.affiliateClicks)} Klicks, ${formatGermanNumber(snapshot.affiliateConversions)} Konversionen, Provisionen gesamt ${formatEur(snapshot.provisionSummeEur)}, ${formatGermanNumber(snapshot.activePartners)} aktive Partner.`,
    `Aktive Subscriptions: ${formatGermanNumber(snapshot.activeSubscriptions)}.`,
  ].join("\n");
}

/* ==================== Fehlerklassifikation (rein) ==================== */

/**
 * Klassifiziert DB-Fehlermeldungen fuer den Snapshot: fehlende Tabellen
 * deuten auf die falsche (oder noch nicht migrierte) Revenue-OS-Datenbank —
 * ein klarer Hinweis statt kryptischem Fehler.
 */
export function describeRevenueOsError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("relation")) {
    return "Tabellen der Revenue-OS-Datenbank fehlen — REVENUE_OS_DATABASE_URL zeigt vermutlich nicht auf die migrierte Revenue-OS-Datenbank (Neon).";
  }
  if (lower.includes("authentication") || lower.includes("password")) {
    return "Anmeldung an der Revenue-OS-Datenbank fehlgeschlagen — Zugangsdaten in REVENUE_OS_DATABASE_URL pruefen.";
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("terminated") || lower.includes("econnrefused")) {
    return "Revenue-OS-Datenbank nicht erreichbar (Timeout oder Verbindung verweigert).";
  }
  return "Unerwarteter Fehler beim Lesen der Revenue-OS-Datenbank.";
}

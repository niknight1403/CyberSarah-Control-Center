/**
 * Sprint 114 — Revenue-OS-Sub-Agent (read-only DB-Anbindung): liest Umsatz,
 * Content-Status, Affiliate-Klicks und Subscriptions aus der Postgres/
 * Neon-Datenbank des Schwestersystems `cybersarah-revenue-os`.
 *
 * Schutzkonventionen:
 *   - Geheimnistrennung: eigene Umgebungsvariable REVENUE_OS_DATABASE_URL —
 *     die DATABASE_URL des Control Centers wird nie angefasst.
 *   - Strikt read-only: die Session wird auf READ ONLY gesetzt und alle
 *     Abfragen stammen aus den getesteten SELECT-Konstanten in
 *     lib/revenue-os-logic.ts. Schreib-Tools sind bewusst nicht Teil
 *     dieses Sprints (Roadmap-Konvention).
 *   - Ehrliche Zustaende: not-configured ohne Secret, error mit klarer
 *     Ursache statt haarstraeubender Fehler.
 */
import { Client } from "pg";

import {
  buildRevenueOsSnapshot,
  describeRevenueOsError,
  REVENUE_OS_QUERIES,
  type RevenueOsQueryResults,
  type RevenueOsSnapshot,
} from "../lib/revenue-os-logic";

let cachedClient: Client | null = null;
let cachedClientUrl = "";

/** Liefert den read-only-Client zur Revenue-OS-Datenbank (lazy, gecacht) oder null. */
async function getRevenueOsClient(): Promise<Client | null> {
  const url = process.env.REVENUE_OS_DATABASE_URL?.trim();
  if (!url) return null;
  if (cachedClient && cachedClientUrl === url) return cachedClient;

  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  await client.connect();
  // Strikt read-only — schreibende Statements schlagen hier fehl, selbst
  // falls jemals eines in den Code gelangte.
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  cachedClient = client;
  cachedClientUrl = url;
  return client;
}

/** Schließt den gecachten Client (bei Verbindungsproblemen, fuer Tests). */
async function resetRevenueOsClient(): Promise<void> {
  const client = cachedClient;
  cachedClient = null;
  cachedClientUrl = "";
  if (client) {
    try {
      await client.end();
    } catch {
      // Bereits defekte Verbindung — nichts mehr zu schliessen.
    }
  }
}

/**
 * Read-only-Snapshot der Revenue-OS-Datenbank. Ohne REVENUE_OS_DATABASE_URL
 * liefert die Funktion den klaren not-configured-Zustand (kein Netzaufruf,
 * kein Fake-Status).
 */
export async function fetchRevenueOsSnapshot(): Promise<RevenueOsSnapshot> {
  let client: Client | null = null;
  try {
    client = await getRevenueOsClient();
    if (!client) return { status: "not-configured" };

    // Sequenziell auf EINEM read-only-Client — die Queries sind leicht-
    // gewichtig (Aggregate) und der Hub ruft parallel zu anderen Sub-Agenten.
    const results: RevenueOsQueryResults = {
      transactionsLast24h: await client.query(REVENUE_OS_QUERIES.transactionsLast24h),
      transactionsTotal: await client.query(REVENUE_OS_QUERIES.transactionsTotal),
      topQuelleLast7d: await client.query(REVENUE_OS_QUERIES.topQuelleLast7d),
      contentByStatus: await client.query(REVENUE_OS_QUERIES.contentByStatus),
      affiliateTotals: await client.query(REVENUE_OS_QUERIES.affiliateTotals),
      activeSubscriptions: await client.query(REVENUE_OS_QUERIES.activeSubscriptions),
    };
    return buildRevenueOsSnapshot(results);
  } catch (error) {
    await resetRevenueOsClient();
    const message = error instanceof Error ? error.message.slice(0, 200) : "Revenue-OS-Lesefehler.";
    console.warn(`[DataHub] Revenue-OS-Snapshot fehlgeschlagen: ${message}`);
    return { status: "error", error: describeRevenueOsError(message) };
  }
}

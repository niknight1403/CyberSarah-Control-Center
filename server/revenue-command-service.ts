/** Zentrale, serverseitige Revenue-Datenquelle. Keine Demo-Zahlen oder Client-Secrets. */
import { TRPCError } from "@trpc/server";
import { Pool, type QueryResultRow } from "pg";
import Stripe from "stripe";
import { fetchTradingSnapshot } from "./data-hub";

let pool: Pool | undefined;
let poolUrl: string | undefined;
function database(): Pool {
  const url = process.env.REVENUE_OS_DATABASE_URL;
  if (!url) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "REVENUE_OS_DATABASE_URL ist nicht konfiguriert." });
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end();
    pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
    poolUrl = url;
  }
  return pool;
}

export async function revenueRows<T extends QueryResultRow>(sql: string): Promise<T[]> {
  try {
    // SQL darf ausschliesslich aus serverseitigen SELECT-Konstanten stammen.
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Nur lesende Revenue-Abfragen erlaubt.");
    return (await database().query<T>(sql)).rows;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.warn("Revenue-Datenabfrage fehlgeschlagen", error instanceof Error ? error.name : "unbekannt");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Revenue-Datenquelle ist nicht erreichbar oder ihr Schema fehlt." });
  }
}

export async function haraOverview() {
  const [proposals, performance] = await Promise.all([
    revenueRows<{ id: number; titel: string; status: string; kanal: string; geschaetzter_monatsumsatz: string; created_at: Date }>(
      "SELECT id, titel, status, kanal, geschaetzter_monatsumsatz, created_at FROM hara_proposals ORDER BY created_at DESC LIMIT 50"),
    revenueRows<{ id: number; resultat: string; created_at: Date }>(
      "SELECT id, resultat, created_at FROM hara_performance ORDER BY created_at DESC LIMIT 20"),
  ]);
  return { proposals, performance, counts: {
    proposals: proposals.length, open: proposals.filter(p => p.status === "vorgeschlagen").length,
    active: proposals.filter(p => ["bestaetigt", "in_umsetzung"].includes(p.status)).length,
    completed: proposals.filter(p => p.status === "abgeschlossen").length,
  }, fetchedAt: new Date().toISOString() };
}

export async function subscriptionsOverview() {
  const [plans, counts, invoices] = await Promise.all([
    revenueRows<{ id: number; name: string; preis: string; waehrung: string; intervall: string; trial_tage: number; aktiv: boolean }>(
      "SELECT id, name, preis, waehrung, intervall, trial_tage, aktiv FROM subscription_plans ORDER BY reihenfolge, id LIMIT 100"),
    revenueRows<{ status: string; count: number; trial_count: number }>("SELECT status, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE trial_ende > NOW())::int AS trial_count FROM customer_subscriptions GROUP BY status LIMIT 20"),
    revenueRows<{ paid_eur_7d: string; paid_eur_30d: string; paid_count: number; failed_count: number }>(
      "SELECT COALESCE(SUM(betrag) FILTER (WHERE status = 'bezahlt' AND bezahlt_am >= NOW() - INTERVAL '7 days' AND waehrung = 'EUR'), 0)::text AS paid_eur_7d, COALESCE(SUM(betrag) FILTER (WHERE status = 'bezahlt' AND bezahlt_am >= NOW() - INTERVAL '30 days' AND waehrung = 'EUR'), 0)::text AS paid_eur_30d, COUNT(*) FILTER (WHERE status = 'bezahlt' AND created_at >= NOW() - INTERVAL '30 days')::int AS paid_count, COUNT(*) FILTER (WHERE status = 'fehlgeschlagen' AND created_at >= NOW() - INTERVAL '30 days')::int AS failed_count FROM subscription_invoices"),
  ]);
  const active = counts.find(c => c.status === "aktiv")?.count ?? 0;
  const trials = counts.reduce((total, c) => total + c.trial_count, 0);
  // MRR nur aus echten aktiven Vertraegen; Jahresplaene auf Monate normalisiert.
  const mrrRows = await revenueRows<{ mrr_eur: string; new_mrr_7d: string; new_mrr_1d: string }>(
    "SELECT COALESCE(SUM(CASE WHEN p.intervall = 'year' THEN p.preis / 12 WHEN p.intervall = 'week' THEN p.preis * 52 / 12 ELSE p.preis END) FILTER (WHERE p.waehrung = 'EUR'), 0)::text AS mrr_eur, COALESCE(SUM(CASE WHEN p.intervall = 'year' THEN p.preis / 12 WHEN p.intervall = 'week' THEN p.preis * 52 / 12 ELSE p.preis END) FILTER (WHERE p.waehrung = 'EUR' AND s.created_at >= NOW() - INTERVAL '7 days'), 0)::text AS new_mrr_7d, COALESCE(SUM(CASE WHEN p.intervall = 'year' THEN p.preis / 12 WHEN p.intervall = 'week' THEN p.preis * 52 / 12 ELSE p.preis END) FILTER (WHERE p.waehrung = 'EUR' AND s.created_at >= NOW() - INTERVAL '1 day'), 0)::text AS new_mrr_1d FROM customer_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.status = 'aktiv'");
  const invoice = invoices[0];
  const attempts = (invoice?.paid_count ?? 0) + (invoice?.failed_count ?? 0);
  return { plans, counts, active, trials, mrrEur: Number(mrrRows[0]?.mrr_eur ?? 0), newMrr7dEur: Number(mrrRows[0]?.new_mrr_7d ?? 0), newMrr1dEur: Number(mrrRows[0]?.new_mrr_1d ?? 0),
    paidEur7d: Number(invoice?.paid_eur_7d ?? 0), paidEur30d: Number(invoice?.paid_eur_30d ?? 0),
    invoiceSuccessRate: attempts ? (invoice!.paid_count / attempts) * 100 : null,
    // Ohne dedizierte Funnel-Events kann keine Content-to-Lead-CVR behauptet werden.
    funnelConversionRate: null as number | null, fetchedAt: new Date().toISOString() };
}

export async function crossSellOverview() {
  const [rules, recommendationCounts] = await Promise.all([
    revenueRows<{ id: number; quell_produkt: string; ziel_produkt: string; aktiv: boolean; anzahl_empfohlen: number; anzahl_konvertiert: number }>(
      "SELECT id, quell_produkt, ziel_produkt, aktiv, anzahl_empfohlen, anzahl_konvertiert FROM cross_sell_rules ORDER BY id DESC LIMIT 50"),
    revenueRows<{ status: string; count: number }>("SELECT status, COUNT(*)::int AS count FROM cross_sell_recommendations GROUP BY status LIMIT 20"),
  ]);
  return { rules, recommendationCounts, fetchedAt: new Date().toISOString() };
}

export async function expansionOverview() {
  const opportunities = await revenueRows<{ id: number; titel: string; status: string; kategorie: string; geschaetzter_umsatz: string; validiert: boolean }>(
    "SELECT id, titel, status, kategorie, geschaetzter_umsatz, validiert FROM expansion_chancen ORDER BY prioritaet, created_at DESC LIMIT 50");
  return { opportunities, fetchedAt: new Date().toISOString() };
}

export async function saasOverview() {
  // Stripe bleibt auch ohne die separate Revenue-Datenbank abfragbar.
  // Unverfuegbare Abo-Zahlen sind null, niemals erfundene Nullen.
  let subscriptions: Awaited<ReturnType<typeof subscriptionsOverview>> | null = null;
  let subscriptionsStatus: "ready" | "not-configured" | "unavailable" = "ready";
  try {
    subscriptions = await subscriptionsOverview();
  } catch (error) {
    if (!(error instanceof TRPCError)) throw error;
    subscriptionsStatus = error.code === "PRECONDITION_FAILED" ? "not-configured" : "unavailable";
  }
  let stripeProducts: { id: string; name: string; active: boolean }[] = [];
  let checkout: { started: number; completed: number; successRate: number | null; capped: boolean } | null = null;
  let stripeStatus: "ready" | "not-configured" | "unavailable" = "not-configured";
  let checkoutStatus: "ready" | "not-configured" | "unavailable" = "not-configured";
  const key = process.env.STRIPE_SECRET_KEY;
  if (key) {
    const stripe = new Stripe(key);
    try {
      const products = await stripe.products.list({ active: true, limit: 100 });
      stripeProducts = products.data.map(({ id, name, active }) => ({ id, name, active }));
      stripeStatus = "ready";
    } catch { stripeStatus = "unavailable"; }
    try {
      const sessions = await stripe.checkout.sessions.list({ created: { gte: Math.floor(Date.now() / 1000) - 30 * 86400 }, limit: 100 }).autoPagingToArray({ limit: 1000 });
      const completed = sessions.filter(item => item.status === "complete").length;
      checkout = { started: sessions.length, completed, successRate: sessions.length ? completed / sessions.length * 100 : null, capped: sessions.length === 1000 };
      checkoutStatus = "ready";
    } catch { checkoutStatus = "unavailable"; }
  }
  return { subscriptions, subscriptionsStatus, stripeProducts, stripeStatus, checkout, checkoutStatus };
}

export async function tradingOverview() { return fetchTradingSnapshot(); }

/** Optionaler Trigger der vorhandenen Revenue-Engine: nur vorgegebene Pfade, kein Client-URL/SSRF. */
export async function triggerRevenueScan(path: "hara/scan" | "expansion/scan") {
  const raw = process.env.REVENUE_OS_API_BASE_URL;
  const secret = process.env.REVENUE_OS_API_KEY;
  if (!raw || !secret) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revenue-Engine oder interner API-Schlüssel fehlt. Scan nicht gestartet." });
  let base: URL;
  try { base = new URL(raw); } catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Ungültige Revenue-Engine-URL." }); }
  // HTTPS fuer externe Engines; eine auf demselben Produktionshost gebundene
  // Loopback-Engine darf per HTTP erreichbar sein (niemals ueber das Netz).
  const localOnly = base.protocol === "http:" && base.hostname === "127.0.0.1" && base.port === "3001";
  if ((!localOnly && base.protocol !== "https:") || base.username || base.password || base.search || base.hash) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revenue-Engine erfordert HTTPS oder den lokalen Loopback-Dienst." });
  }
  const target = new URL(`/api/${path}`, base);
  try {
    const response = await fetch(target, { method: "POST", headers: { "X-Revenue-Internal-Key": secret }, signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error("upstream_rejected");
    const result = await response.json() as { success?: boolean; background?: boolean; entdeckt?: number; gespeichert?: number };
    if (!result.success && (path !== "expansion/scan" || typeof result.gespeichert !== "number")) throw new Error("upstream_rejected");
    // Das Quellsystem antwortet asynchron. Annahme ist NICHT Loop-Erfolg.
    return { accepted: true, completed: path === "expansion/scan", background: result.background === true };
  } catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Revenue-Scan konnte nicht gestartet oder bestaetigt werden." }); }
}

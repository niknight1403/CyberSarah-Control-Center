/** Read-only GitHub-Actions-Check. Nie Secret-Werte, URLs oder Fehlerdetails ausgeben. */
import { Pool } from 'pg';
import Stripe from 'stripe';

const requiredTables = [
  'hara_proposals', 'hara_performance', 'subscription_plans',
  'customer_subscriptions', 'subscription_invoices',
  'cross_sell_rules', 'cross_sell_recommendations', 'expansion_chancen',
];
const routeQueries = [
  'SELECT id, titel, status, kanal, geschaetzter_monatsumsatz, created_at FROM hara_proposals LIMIT 0',
  'SELECT id, resultat, created_at FROM hara_performance LIMIT 0',
  'SELECT id, name, preis, waehrung, intervall, trial_tage, aktiv, reihenfolge FROM subscription_plans LIMIT 0',
  'SELECT status, trial_ende, plan_id, created_at FROM customer_subscriptions LIMIT 0',
  'SELECT betrag, status, bezahlt_am, created_at, waehrung FROM subscription_invoices LIMIT 0',
  'SELECT id, quell_produkt, ziel_produkt, aktiv, anzahl_empfohlen, anzahl_konvertiert FROM cross_sell_rules LIMIT 0',
  'SELECT status FROM cross_sell_recommendations LIMIT 0',
  'SELECT id, titel, status, kategorie, geschaetzter_umsatz, validiert, prioritaet, created_at FROM expansion_chancen LIMIT 0',
];
async function checkDb(label, url) {
  if (!url) { console.log(`${label}: NOT_CONFIGURED`); return false; }
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  try {
    const result = await pool.query('SELECT to_regclass($1)::text AS name', ['public.hara_proposals']);
    if (!result.rows[0]?.name) { console.log(`${label}: REACHABLE_SCHEMA_MISMATCH`); return false; }
    const tables = await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])", [requiredTables]);
    const found = new Set(tables.rows.map(row => row.tablename));
    const missing = requiredTables.filter(t => !found.has(t));
    if (missing.length) {
      console.log(`${label}: SCHEMA_INCOMPLETE (${found.size}/${requiredTables.length} required tables)`);
      return false;
    }
    for (const sql of routeQueries) await pool.query(sql);
    console.log(`${label}: READY (${found.size}/${requiredTables.length} tables; required columns selectable)`);
    return true;
  } catch { console.log(`${label}: CONNECTION_OR_PERMISSION_ERROR`); return false; }
  finally { await pool.end().catch(() => undefined); }
}
async function main() {
  const dedicated = await checkDb('REVENUE_OS_DATABASE_URL', process.env.REVENUE_OS_DATABASE_URL);
  if (!dedicated) await checkDb('DATABASE_URL (nur Schema-Diagnose, kein Ersatz)', process.env.DATABASE_URL);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) console.log('STRIPE_SECRET_KEY: NOT_CONFIGURED');
  else {
    try {
      await new Stripe(stripeKey).products.list({ limit: 1 });
      console.log(`STRIPE_SECRET_KEY: REACHABLE (${stripeKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'})`);
    } catch { console.log('STRIPE_SECRET_KEY: CONNECTION_OR_PERMISSION_ERROR'); }
  }
  console.log('REVENUE_OS_API_BASE_URL:', process.env.REVENUE_OS_API_BASE_URL ? 'CONFIGURED' : 'NOT_CONFIGURED');
  console.log('REVENUE_OS_API_KEY:', process.env.REVENUE_OS_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED');
  // Informativ: fehlende Konfiguration niemals als erfolgreichen Live-Loop ausgeben.
  if (!dedicated || !stripeKey || !process.env.REVENUE_OS_API_BASE_URL || !process.env.REVENUE_OS_API_KEY) {
    console.log('REVENUE_LOOPS: NOT_READY');
    process.exitCode = 1;
  }
}
await main();

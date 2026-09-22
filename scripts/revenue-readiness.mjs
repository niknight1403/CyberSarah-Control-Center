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
  let connectionString = url;
  // Lokale Produktions-DB nie ins Internet exponieren: GitHub Runner nutzt einen
  // kurzlebigen SSH-Tunnel. Die Postgres-Zugangsdaten bleiben als Actions-Secret.
  if (label === 'REVENUE_OS_DATABASE_URL') {
    try {
      const target = new URL(url);
      if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
        const port = process.env.REVENUE_OS_DB_TUNNEL_PORT;
        if (!port || !/^\d{2,5}$/.test(port)) { console.log(`${label}: LOCAL_CONNECTION_REQUIRES_TUNNEL`); return false; }
        target.hostname = '127.0.0.1'; target.port = port;
        connectionString = target.toString();
      }
    } catch { console.log(`${label}: INVALID_CONFIGURATION`); return false; }
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
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
async function checkEngine() {
  const raw = process.env.REVENUE_OS_API_BASE_URL;
  const key = process.env.REVENUE_OS_API_KEY;
  if (!raw || !key) { console.log('REVENUE_BRIDGE: NOT_CONFIGURED'); return false; }
  try {
    const base = new URL(raw);
    const local = base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port === '18741';
    if (!local && base.protocol !== 'https:') throw new Error('unsupported_endpoint');
    const health = await fetch(new URL('/api/healthz', base), { signal: AbortSignal.timeout(7000) });
    if (!health.ok || (await health.json()).status !== 'ready') throw new Error('health_unavailable');
    const overview = await fetch(new URL('/api/hara/overview', base), { headers: { 'X-Revenue-Internal-Key': key }, signal: AbortSignal.timeout(7000) });
    if (!overview.ok) throw new Error('authenticated_read_unavailable');
    // Kein echter Scan im Readiness-Check: nur Ablehnung ohne Zugangsschluessel pruefen.
    const rejected = await fetch(new URL('/api/hara/scan', base), { method: 'POST', signal: AbortSignal.timeout(7000) });
    if (rejected.status !== 403) throw new Error('scan_not_protected');
    console.log('REVENUE_BRIDGE: READY (DB health, authenticated read, scan denied without key)');
    return true;
  } catch { console.log('REVENUE_BRIDGE: UNAVAILABLE_OR_UNPROTECTED'); return false; }
}
async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.log('OPENAI_API_KEY: NOT_CONFIGURED'); return false; }
  try {
    const response = await fetch('https://api.openai.com/v1/models?limit=1', {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(7000),
    });
    console.log(`OPENAI_API_KEY: ${response.ok ? 'REACHABLE' : 'UNAVAILABLE'}`);
    return response.ok;
  } catch { console.log('OPENAI_API_KEY: UNAVAILABLE'); return false; }
}
async function main() {
  const dedicated = await checkDb('REVENUE_OS_DATABASE_URL', process.env.REVENUE_OS_DATABASE_URL);
  if (!dedicated) await checkDb('DATABASE_URL (nur Schema-Diagnose, kein Ersatz)', process.env.DATABASE_URL);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let stripeReady = false;
  if (!stripeKey) console.log('STRIPE_SECRET_KEY: NOT_CONFIGURED');
  else {
    try {
      await new Stripe(stripeKey).products.list({ limit: 1 });
      stripeReady = stripeKey.startsWith('sk_live_');
      console.log(`STRIPE_SECRET_KEY: REACHABLE (${stripeReady ? 'LIVE' : 'TEST'})`);
    } catch { console.log('STRIPE_SECRET_KEY: CONNECTION_OR_PERMISSION_ERROR'); }
  }
  const aiReady = await checkOpenAI();
  const bridgeReady = await checkEngine();
  if (!dedicated || !stripeReady || !aiReady || !bridgeReady) {
    console.log('REVENUE_INTEGRATION: NOT_READY');
    process.exitCode = 1;
  } else {
    console.log('REVENUE_INTEGRATION: READY (proposal scans are guarded, not auto-executed)');
  }
}
await main();

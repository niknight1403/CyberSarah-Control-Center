/** Dedizierte, ausschließlich lokale Control-Center-Bridge.
 * Keine globale Agent-Initialisierung, Stripe-Autoprovisionierung, Produkt-
 * Erstellung, Mail-/Social-/Trading-Crons oder Schema-Push beim Start.
 */
import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import pinoHttp from 'pino-http';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import { logger } from './lib/logger';
import haraRouter from './routes/hara';
import expansionRouter from './routes/expansion';

const key = process.env.REVENUE_OS_API_KEY;
const port = Number(process.env.REVENUE_OS_INTEGRATION_PORT ?? '18741');
if (process.env.REVENUE_OS_INTEGRATION_ONLY !== '1' || !db || !key || key.length < 32 ||
    !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Revenue-Bridge-Konfiguration unvollständig, Start verweigert');
}
const app = express();
app.disable('x-powered-by');
app.use(pinoHttp({ logger }));
app.get('/api/healthz', async (_req, res) => {
  try { await db.execute(sql`SELECT 1`); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});
const allowed = new Set([
  'GET /api/hara/overview', 'GET /api/expansion/chancen', 'GET /api/expansion/status',
  'POST /api/hara/scan', 'POST /api/expansion/scan',
]);
app.use((req, res, next) => {
  if (!allowed.has(`${req.method} ${req.path}`)) { res.sendStatus(404); return; }
  const supplied = req.get('X-Revenue-Internal-Key') ?? '';
  if (!supplied || Buffer.byteLength(key) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(supplied))) {
    res.sendStatus(403); return;
  }
  next();
});
app.use('/api', haraRouter, expansionRouter);
app.listen(port, '127.0.0.1', () => logger.info({ port }, 'Revenue-Bridge lokal bereit'));

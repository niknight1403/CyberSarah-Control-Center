import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

function authorized(req: Request): boolean {
  const expected = (process.env.METRICS_TOKEN ?? "").trim();
  const supplied = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rowsOf<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as T[] : [];
  }
  return [];
}

function requireMetricsAccess(req: Request, res: Response): boolean {
  if (authorized(req)) return true;
  res.status(process.env.METRICS_TOKEN ? 401 : 503).json({
    error: process.env.METRICS_TOKEN ? "metrics_auth_required" : "metrics_token_not_configured",
  });
  return false;
}

/**
 * Read-only aggregation over the existing CyberSarah revenue tables.
 * No second billing database and no raw customer PII leave this endpoint.
 */
export function registerObservabilityHub(app: Express) {
  app.get("/api/observability/summary", async (req, res) => {
    if (!requireMetricsAccess(req, res)) return;
    const db = await getDb();
    if (!db) { res.status(503).json({ error: "database_unavailable" }); return; }

    try {
      const [dailyResult, funnelResult, conversionResult] = await Promise.all([
        db.execute(sql`SELECT day, clicks, conversions, "revenueCents" AS "revenueCents"
          FROM revenue_daily_stats ORDER BY day DESC LIMIT 30`),
        db.execute(sql`SELECT status, COUNT(*)::int AS campaigns,
          COALESCE(SUM("viewCount"), 0)::bigint AS views,
          COALESCE(SUM("clickCount"), 0)::bigint AS clicks
          FROM funnel_campaigns GROUP BY status ORDER BY status`),
        db.execute(sql`SELECT currency, "eventType" AS "eventType",
          COUNT(*)::int AS events,
          COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents",
          COALESCE(SUM("commissionCents"), 0)::bigint AS "commissionCents"
          FROM conversion_events
          WHERE "occurredAt" >= now() - interval '30 days'
          GROUP BY currency, event_type ORDER BY currency, event_type`),
      ]);
      const daily = rowsOf<Record<string, unknown>>(dailyResult);
      const funnels = rowsOf<Record<string, unknown>>(funnelResult);
      const conversions = rowsOf<Record<string, unknown>>(conversionResult);
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = daily.find((row) => String(row.day) === today);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        generatedAt: new Date().toISOString(),
        source: "cybersarah_primary_database",
        revenue: {
          todayCents: Number(todayRow?.revenueCents ?? 0),
          last30Days: conversions,
          daily: daily.reverse(),
        },
        funnels,
        privacy: { customerEmailsIncluded: false, rawWebhookPayloadsIncluded: false },
      });
    } catch (error) {
      console.error("[ObservabilityHub] summary query failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ error: "observability_query_failed" });
    }
  });

  app.get("/api/observability/metrics", async (req, res) => {
    if (!requireMetricsAccess(req, res)) return;
    const db = await getDb();
    if (!db) { res.status(503).type("text/plain").send("database_unavailable\n"); return; }
    try {
      const result = await db.execute(sql`SELECT
        COALESCE(SUM("revenueCents"), 0)::bigint AS revenue_cents,
        COALESCE(SUM(clicks), 0)::bigint AS funnel_clicks,
        COALESCE(SUM(conversions), 0)::bigint AS funnel_conversions
        FROM revenue_daily_stats WHERE day >= to_char(current_date - 29, 'YYYY-MM-DD')`);
      const row = rowsOf<Record<string, unknown>>(result)[0] ?? {};
      const memory = process.memoryUsage();
      const lines = [
        "# HELP cybersarah_process_uptime_seconds Node process uptime.",
        "# TYPE cybersarah_process_uptime_seconds gauge",
        `cybersarah_process_uptime_seconds ${process.uptime()}`,
        "# HELP cybersarah_process_resident_memory_bytes Resident memory.",
        "# TYPE cybersarah_process_resident_memory_bytes gauge",
        `cybersarah_process_resident_memory_bytes ${memory.rss}`,
        "# HELP cybersarah_revenue_30d_cents Recorded revenue in the last 30 days, cents.",
        "# TYPE cybersarah_revenue_30d_cents gauge",
        `cybersarah_revenue_30d_cents ${Number(row.revenue_cents ?? 0)}`,
        "# HELP cybersarah_funnel_clicks_30d Total recorded funnel clicks in the last 30 days.",
        "# TYPE cybersarah_funnel_clicks_30d gauge",
        `cybersarah_funnel_clicks_30d ${Number(row.funnel_clicks ?? 0)}`,
        "# HELP cybersarah_funnel_conversions_30d Total recorded funnel conversions in the last 30 days.",
        "# TYPE cybersarah_funnel_conversions_30d gauge",
        `cybersarah_funnel_conversions_30d ${Number(row.funnel_conversions ?? 0)}`,
        "",
      ];
      res.type("text/plain; version=0.0.4; charset=utf-8").send(lines.join("\n"));
    } catch (error) {
      console.error("[ObservabilityHub] metrics query failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).type("text/plain").send("metrics_query_failed\n");
    }
  });
}

import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Conservative growth autopilot.
 * It only creates deduplicated proposals in revenue_jobs. It never sends mail,
 * changes prices, publishes content, starts ad spend or mutates Stripe.
 * Every proposal requires a separate, authenticated approval workflow.
 */
const HOUR_MS = 60 * 60 * 1000;
const ENABLED = process.env.GROWTH_AUTOPILOT_ENABLED === "1";
const MIN_CLICKS = Math.max(1, Number(process.env.GROWTH_AUTOPILOT_MIN_CLICKS ?? 50));

type Daily = { clicks: number | string; conversions: number | string; revenueCents: number | string };
type Funnel = { status: string; campaigns: number | string; views: number | string; clicks: number | string };

function numeric(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function runOnce(): Promise<void> {
  if (!ENABLED) {
    console.info("[GrowthAutopilot] disabled; set GROWTH_AUTOPILOT_ENABLED=1 to enable proposal generation.");
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("GrowthAutopilot requires the application database");

  const [dailyResult, funnelResult] = await Promise.all([
    db.execute(sql`SELECT clicks, conversions, "revenueCents"
      FROM revenue_daily_stats
      WHERE day >= to_char(current_date - 6, 'YYYY-MM-DD')
      ORDER BY day DESC`),
    db.execute(sql`SELECT status, COUNT(*)::int AS campaigns,
      COALESCE(SUM("viewCount"), 0)::bigint AS views,
      COALESCE(SUM("clickCount"), 0)::bigint AS clicks
      FROM funnel_campaigns GROUP BY status`),
  ]);
  const daily = ((dailyResult as unknown as { rows?: Daily[] }).rows ?? []);
  const funnels = ((funnelResult as unknown as { rows?: Funnel[] }).rows ?? []);
  const clicks = daily.reduce((sum, row) => sum + numeric(row.clicks), 0);
  const conversions = daily.reduce((sum, row) => sum + numeric(row.conversions), 0);
  const revenueCents = daily.reduce((sum, row) => sum + numeric(row.revenueCents), 0);
  const conversionRate = clicks > 0 ? conversions / clicks : 0;
  const active = funnels.reduce((sum, row) => sum + (String(row.status).toLowerCase() === "active" ? numeric(row.campaigns) : 0), 0);

  const proposals: Array<{ key: string; kind: string; title: string; rationale: string; evidence: Record<string, number> }> = [];
  if (clicks >= MIN_CLICKS && conversions === 0) {
    proposals.push({
      key: "funnel-zero-conversion-7d",
      kind: "growth_funnel_diagnosis",
      title: "Funnel ohne gemessene Conversion untersuchen",
      rationale: "Es liegen ausreichend Klicks, aber keine erfassten Conversions in den letzten sieben Tagen vor. Erst Tracking und Checkout prüfen; keine Kampagnen oder Ausgaben automatisch ändern.",
      evidence: { clicks7d: clicks, conversions7d: conversions, revenueCents7d: revenueCents },
    });
  }
  if (clicks >= MIN_CLICKS && conversions > 0 && conversionRate < 0.01) {
    proposals.push({
      key: "funnel-low-conversion-7d",
      kind: "growth_funnel_review",
      title: "Niedrige Funnel-Conversion prüfen",
      rationale: "Die gemessene Conversion-Rate liegt unter 1 %. Landingpage, Zielgruppenpassung, Ladezeit und Checkout-Fehler priorisiert untersuchen.",
      evidence: { clicks7d: clicks, conversions7d: conversions, conversionRate7d: conversionRate, revenueCents7d: revenueCents },
    });
  }
  if (active === 0) {
    proposals.push({
      key: "no-active-campaigns",
      kind: "growth_campaign_review",
      title: "Aktive Kampagnen und Publishing-Plan prüfen",
      rationale: "In den gespeicherten Funnel-Daten ist keine aktive Kampagne markiert. Vor Aktivierung Budget, Freigaben und Tracking prüfen.",
      evidence: { activeCampaigns: active, clicks7d: clicks, conversions7d: conversions },
    });
  }

  for (const proposal of proposals) {
    await db.execute(sql`INSERT INTO revenue_jobs (dedupe_key, kind, status, payload)
      VALUES (${`growth-autopilot:${proposal.key}`}, ${proposal.kind}, 'pending_approval',
        ${JSON.stringify({ title: proposal.title, rationale: proposal.rationale, evidence: proposal.evidence, requiresHumanApproval: true, generatedAt: new Date().toISOString() })}::jsonb)
      ON CONFLICT (dedupe_key) DO NOTHING`);
  }
  console.info("[GrowthAutopilot] cycle complete", {
    mode: "proposal-only",
    proposalsCreated: proposals.length,
    clicks7d: clicks,
    conversions7d: conversions,
    activeCampaigns: active,
  });
}

async function main() {
  console.info(`[GrowthAutopilot] started; enabled=${ENABLED}; interval=1h; actions=proposal-only`);
  const tick = async () => {
    try { await runOnce(); }
    catch (error) { console.error("[GrowthAutopilot] cycle failed:", error instanceof Error ? error.message : "unknown"); }
  };
  await tick();
  setInterval(() => { void tick(); }, HOUR_MS);
}

void main().catch((error) => {
  console.error("[GrowthAutopilot] startup failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});

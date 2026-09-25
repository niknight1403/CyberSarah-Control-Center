/**
 * Sprint 368 — E2E: Conversion-Loop. Live-Insights (Sprint 367) heben die
 * bewaehrte Persona ins Fokus-Ranking der naechsten Kampagne.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { publishingJobs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { enqueueCampaignForUser, getPersonaPerformanceForUser } from "../server/publishing-service";
import { planInfluencerCampaign } from "../lib/influencer-reach-logic";

const USER = "e2e-368-owner";
const PRODUCT = "AI-Produktivitaets-Tool";

async function seedJob(row: { persona: string; status: string; mode: string; insights: Record<string, number> }) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  await db.insert(publishingJobs).values({
    userOpenId: USER,
    product: "Sprint-368-Seed",
    goal: "wachstum",
    persona: row.persona,
    platform: "instagram",
    campaignDay: 1,
    dedupeKey: `s368|${row.persona}|${row.status}|${row.insights.reach ?? 0}`,
    status: row.status as never,
    scheduledFor: new Date(Date.now() - 300_000),
    mode: row.mode as never,
    assetUrl: null,
    assetUrls: [],
    externalId: row.mode === "live" ? `seed-${row.persona}` : null,
    insights: row.insights,
    insightsFetchedAt: Object.keys(row.insights).length ? new Date() : null,
    publishedAt: row.status === "veroeffentlicht" ? new Date(Date.now() - 300_000) : null,
  });
  await pool.end();
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  await drizzle(pool).delete(publishingJobs).where(eq(publishingJobs.userOpenId, USER));
  await pool.end();

  // 1) Baseline ohne Performance-Daten
  const baseline = planInfluencerCampaign(PRODUCT, "wachstum");
  console.log("Baseline-Fokus:", baseline.focusPersona, "| Runner-up:", baseline.supportingPersonas[0]);

  // 2) Runner-up hat bewaehrte Live-Reichweite nachgewiesen (Sprint-367-Insights)
  const boostedPersona = baseline.supportingPersonas[0];
  await seedJob({ persona: boostedPersona, status: "veroeffentlicht", mode: "live", insights: { reach: 6000, impressions: 12000 } });
  await seedJob({ persona: boostedPersona, status: "veroeffentlicht", mode: "live", insights: { reach: 4000, impressions: 9000 } });
  await seedJob({ persona: boostedPersona, status: "sandbox_veroeffentlicht", mode: "sandbox", insights: { reach: 99999, impressions: 99999 } });
  await seedJob({ persona: "kaya", status: "fehlgeschlagen", mode: "live", insights: {} });

  const performance = await getPersonaPerformanceForUser(USER);
  console.log("Performance-Aggregat:", JSON.stringify(performance[boostedPersona]));

  // 3) Neue Kampagne: bewaehrte Persona steigt auf
  const result = await enqueueCampaignForUser(USER, { product: PRODUCT, goal: "wachstum", days: 2 });
  console.log("Kampagne eingereiht:", JSON.stringify(result));

  const ok =
    result.inserted > 0 &&
    result.focusPersona === boostedPersona &&
    performance[boostedPersona]?.livePosts === 2 &&
    performance[boostedPersona]?.reach === 10000 &&
    performance.kaya?.failedPosts === 1;

  console.log("PRUEFUNG:", ok, "| Fokus jetzt:", result.focusPersona);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E-368-FEHLER:", error);
  process.exit(1);
});

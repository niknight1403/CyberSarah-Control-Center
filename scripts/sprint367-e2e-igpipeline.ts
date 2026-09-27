/**
 * Sprint 367 — E2E: Instagram-Medien-Pipeline final (Issue #45).
 * Mock-Graph-API mit Container-Polling (IN_PROGRESS -> FINISHED), Carousel,
 * Reels, Auto-Karte (app-gehostet), vorabiger Validierung und Insights.
 */
import { createServer } from "node:http";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { publishingJobs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { setInvokeLlmForTests } from "../server/_core/llm";
import { buildPublishingCardPng, autoCardAssetUrl } from "../lib/asset-card-logic";
import {
  enqueueCampaignForUser,
  listPublishingJobsForUser,
  processDueJobsForUser,
  collectInstagramInsightsForUser,
  setPublishingJobAssets,
  setPublishingJobAsset,
  publicAssetBaseUrl,
} from "../server/publishing-service";

const USER = "e2e-367-owner";
const state = { polls: 0, containerCalls: 0, publishCalls: 0, insightsCalls: 0, autoCardFetched: 0, carouselChildren: 0 };

function startMockApi(): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const url = req.url ?? "";
        res.setHeader("content-type", "application/json");
        if (url.includes("/insights")) {
          state.insightsCalls += 1;
          res.end(JSON.stringify({ data: [{ name: "impressions", values: [{ value: 1234 }] }, { name: "reach", values: [{ value: 567 }] }] }));
        } else if (url.includes("/media_publish")) {
          state.publishCalls += 1;
          res.end(JSON.stringify({ id: `ig-publish-${state.publishCalls}` }));
        } else if (url.includes("/media")) {
          state.containerCalls += 1;
          if (req.url!.includes("is_carousel_item")) state.carouselChildren += 1;
          res.end(JSON.stringify({ id: `ig-container-${state.containerCalls}` }));
        } else if (/\/ig-container-\d+\?/.test(url) && url.includes("fields=status")) {
          state.polls += 1;
          // Erst der 2. Poll meldet FINISHED — echtes Polling-Verhalten.
          res.end(JSON.stringify({ status: state.polls >= 2 ? "FINISHED" : "IN_PROGRESS" }));
        } else if (url.endsWith(".png")) {
          state.autoCardFetched += 1;
          // Die echte Graph-API wuerde hier die Auto-Karte abholen.
          res.end(buildPublishingCardPng({ personaId: "ava", product: "Probe", headline: "Probe" }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `unbekannter Mock-Pfad: ${url}` }));
        }
      });
    });
    server.listen(4599, () => resolve());
  });
}

async function insertJob(row: { platform: string; persona: string; dedupeKey: string; assetUrl?: string | null; assetUrls?: string[] }) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  const [job] = await db
    .insert(publishingJobs)
    .values({
      userOpenId: USER,
      product: "Sprint-367-IG-Pipeline",
      goal: "wachstum",
      persona: row.persona,
      platform: row.platform,
      campaignDay: 1,
      dedupeKey: row.dedupeKey,
      assetUrl: row.assetUrl ?? null,
      assetUrls: row.assetUrls ?? [],
      scheduledFor: new Date(Date.now() - 60_000),
    })
    .returning();
  await pool.end();
  return job;
}

async function main() {
  // Idempotent: alte Laeufe desselben E2E-Users aufraeumen (Dedupe-Index).
  const cleanupPool = new Pool({ connectionString: process.env.DATABASE_URL! });
  await drizzle(cleanupPool).delete(publishingJobs).where(eq(publishingJobs.userOpenId, USER));
  await cleanupPool.end();

  await startMockApi();
  setInvokeLlmForTests(async () => ({
    id: "e2e367", created: 0, model: "stub",
    choices: [{ index: 0, message: { role: "assistant", content: "Sprint-367-E2E: Autonome Pipeline mit klarem Nutzen und Call-to-Action." } }],
  } as never));
  process.env.INSTAGRAM_PUBLISH_TOKEN = "mock-ig";
  process.env.INSTAGRAM_PUBLISH_USER_ID = "1789001";
  process.env.INSTAGRAM_API_BASE_URL = "http://localhost:4599";
  process.env.IG_CONTAINER_POLL_DELAY_MS = "50";
  process.env.PUBLIC_BASE_URL = "http://localhost:4599";

  // 1) Auto-Karte: IG-Job OHNE Asset -> app-gehostete PNG-Karte, live (Optimierung 2+5)
  const autoJob = await insertJob({ platform: "instagram", persona: "ava", dedupeKey: "s367|ava|auto|1" });
  // 2) Carousel: 3 Assets (Optimierung 3)
  const carouselJob = await insertJob({
    platform: "instagram", persona: "juno", dedupeKey: "s367|juno|carousel|1",
    assetUrls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg", "https://cdn.example.com/c.jpg"],
  });
  // 3) Reels: Video-Asset (Optimierung 3)
  const reelsJob = await insertJob({ platform: "instagram", persona: "mira", dedupeKey: "s367|mira|reels|1", assetUrl: "https://cdn.example.com/reel.mp4" });
  // 4) Validierung vorab: ungueltiges GIF wird ehrlich abgelehnt (Optimierung 4)
  const invalidJob = await insertJob({ platform: "instagram", persona: "kaya", dedupeKey: "s367|kaya|invalid|1", assetUrl: "https://cdn.example.com/bild.gif" });

  console.log("Basis-URL:", publicAssetBaseUrl(), "| Auto-Karten-URL:", autoCardAssetUrl(publicAssetBaseUrl()!, autoJob.id));

  const outcome = await processDueJobsForUser(USER);
  console.log("Autopilot-Tick:", JSON.stringify(outcome));

  const final = await listPublishingJobsForUser(USER);
  for (const job of final) {
    console.log(`  ${job.persona.padEnd(6)} ${job.platform.padEnd(10)} | ${(job.status ?? "").padEnd(24)} | Ext: ${(job.externalId ?? "-").padEnd(14)} | Insights: ${JSON.stringify(job.insights)}`);
  }
  const byPersona = Object.fromEntries(final.map((job) => [job.persona, job]));

  // 5) Insights-Rueckkanal (Optimierung 6): publishedAt-Handicap umgehen, dann einsammeln
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  await db.update(publishingJobs).set({ publishedAt: new Date(Date.now() - 120_000) }).where(eq(publishingJobs.userOpenId, USER));
  await pool.end();
  const collected = await collectInstagramInsightsForUser(USER);
  console.log("Insights eingesammelt:", collected, "| Mock-Aufrufe:", state.insightsCalls);
  const after = await listPublishingJobsForUser(USER);
  for (const job of after.filter((j) => j.insightsFetchedAt)) {
    console.log(`  Insights ${job.persona}:`, JSON.stringify(job.insights), "| geholt:", job.insightsFetchedAt?.toISOString());
  }

  // 6) setAssets / setAsset Pfade (tRPC-Rueckgrat)
  const setMulti = await setPublishingJobAssets(USER, carouselJob.id, ["https://cdn.example.com/x.jpg", "https://cdn.example.com/y.jpg"]);
  console.log("setAssets auf veroeffentlichtem Job (muss ablehnen):", JSON.stringify(setMulti));
  const pool2 = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db2 = drizzle(pool2);
  const [planned] = await db2.insert(publishingJobs).values({
    userOpenId: USER, product: "Sprint-367-Set", goal: "umsatz", persona: "rio", platform: "instagram",
    campaignDay: 2, dedupeKey: "s367|rio|set|2", scheduledFor: new Date(Date.now() + 86_400_000),
  }).returning();
  await pool2.end();
  console.log("setAssets auf geplantem Job:", JSON.stringify(await setPublishingJobAssets(USER, planned.id, ["https://cdn.example.com/x.jpg", "https://cdn.example.com/y.jpg"])));
  console.log("setAsset single:", await setPublishingJobAsset(USER, planned.id, "https://cdn.example.com/z.png"));

  const autoOk = byPersona.ava?.status === "veroeffentlicht" && byPersona.ava.mode === "live";
  const carouselOk = byPersona.juno?.status === "veroeffentlicht" && state.carouselChildren === 3;
  const reelsOk = byPersona.mira?.status === "veroeffentlicht";
  const invalidOk = (byPersona.kaya?.status ?? "") !== "veroeffentlicht" && (byPersona.kaya?.lastError ?? "").includes("ungueltig");
  const polledOk = state.polls >= 4; // mind. 2 Container gepollt (2 Polls je bis FINISHED)
  const insightsOk = collected >= 1 && after.some((j) => (j.insights?.reach ?? 0) === 567);

  console.log("\nPRUEFUNG: autoOk", autoOk, "| carouselOk", carouselOk, "| reelsOk", reelsOk, "| invalidOk", invalidOk, "| polledOk", polledOk, "| insightsOk", insightsOk);
  process.exit(autoOk && carouselOk && reelsOk && invalidOk && polledOk && insightsOk ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E-367-FEHLER:", error);
  process.exit(1);
});

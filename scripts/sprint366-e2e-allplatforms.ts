/**
 * Sprint 366 — E2E: VOLLSTAENDIGE Automatisierung ueber ALLE 5 Plattformen.
 * Lokale Mock-APIs (X, LinkedIn, Threads, Instagram 2-Schritt, TikTok
 * PULL_FROM_URL) stehen als echte HTTP-Endpunkte — der Autopilot durchlaeuft
 * den kompletten Live-Pfad inkl. Asset-Anforderung und Sandbox-Ehrlichkeit.
 */
import { createServer } from "node:http";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { publishingJobs } from "../drizzle/schema";
import { setInvokeLlmForTests } from "../server/_core/llm";
import {
  enqueueCampaignForUser,
  getPublishingModeOverview,
  listPublishingJobsForUser,
  processDueJobsForUser,
} from "../server/publishing-service";

const USER = "e2e-366-owner";
let igContainerCalls = 0;

function startMockApi(): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const url = req.url ?? "";
        res.setHeader("content-type", "application/json");
        if (url.startsWith("/2/tweets")) {
          res.end(JSON.stringify({ data: { id: "x-mock-123", text: "ok" } }));
        } else if (url.startsWith("/v2/ugcPosts")) {
          res.end(JSON.stringify({ id: "li-mock-456" }));
        } else if (url.startsWith("/v1.0/threads")) {
          res.end(JSON.stringify({ id: "th-mock-789" }));
        } else if (url.includes("/media_publish")) {
          res.end(JSON.stringify({ id: "ig-publish-42" }));
        } else if (url.includes("/media")) {
          igContainerCalls += 1;
          res.end(JSON.stringify({ id: `ig-container-${igContainerCalls}` }));
        } else if (url.startsWith("/v2/post/publish/video/init")) {
          if (!body.includes("PULL_FROM_URL")) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "video_url fehlt" }));
            return;
          }
          res.end(JSON.stringify({ data: { publish_id: "tt-mock-999" } }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "unbekannter Mock-Pfad" }));
        }
      });
    });
    server.listen(4599, () => resolve());
  });
}

async function insertDirectJob(row: { platform: string; persona: string; dedupeKey: string; assetUrl?: string | null }) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  const [job] = await db
    .insert(publishingJobs)
    .values({
      userOpenId: USER,
      product: "Sprint-366-Vollautomatik",
      goal: "umsatz",
      persona: row.persona,
      platform: row.platform,
      campaignDay: 1,
      dedupeKey: row.dedupeKey,
      assetUrl: row.assetUrl ?? null,
      scheduledFor: new Date(Date.now() - 60_000),
    })
    .returning();
  await pool.end();
  return job.id;
}

async function main() {
  await startMockApi();
  setInvokeLlmForTests(async () => ({
    id: "e2e366",
    created: 0,
    model: "stub",
    choices: [{ index: 0, message: { role: "assistant", content: "Vollautomatischer E2E-Post: Nutzen, Beweis, Call-to-Action — alle Plattformen." } }],
  } as never));

  // Alle Plattform-Credentials auf die Mock-API zeigen lassen
  process.env.X_PUBLISH_TOKEN = "mock-x";
  process.env.X_API_BASE_URL = "http://localhost:4599/2";
  process.env.LINKEDIN_PUBLISH_TOKEN = "mock-li";
  process.env.LINKEDIN_PUBLISH_USER_URN = "urn:li:person:mock";
  process.env.LINKEDIN_API_BASE_URL = "http://localhost:4599/v2";
  process.env.THREADS_PUBLISH_TOKEN = "mock-th";
  process.env.THREADS_PUBLISH_USER_ID = "threads-mock";
  process.env.THREADS_API_BASE_URL = "http://localhost:4599/v1.0";
  process.env.INSTAGRAM_PUBLISH_TOKEN = "mock-ig";
  process.env.INSTAGRAM_PUBLISH_USER_ID = "1789001";
  process.env.INSTAGRAM_API_BASE_URL = "http://localhost:4599";
  process.env.TIKTOK_PUBLISH_TOKEN = "mock-tt";
  process.env.TIKTOK_API_BASE_URL = "http://localhost:4599/v2";

  console.log("Plattform-Modi (mit Asset):");
  for (const [platform, info] of Object.entries(getPublishingModeOverview())) {
    console.log(`  ${platform.padEnd(10)} -> ${info.mode.padEnd(7)} | ${info.reason.slice(0, 70)}`);
  }

  // Live-Jobs fuer alle 5 Plattformen anlegen (Medien mit Asset)
  const jobs: Array<{ platform: string; persona: string; assetUrl?: string }> = [
    { platform: "x", persona: "nova" },
    { platform: "linkedin", persona: "juno" },
    { platform: "threads", persona: "mira" },
    { platform: "instagram", persona: "ava", assetUrl: "https://cdn.example.com/ava.jpg" },
    { platform: "tiktok", persona: "orion", assetUrl: "https://cdn.example.com/orion.mp4" },
  ];
  for (const job of jobs) {
    await insertDirectJob({ ...job, dedupeKey: `s366|${job.persona}|${job.platform}|1` });
  }
  // Ehrlichkeits-Job: Instagram ohne Asset -> muss Sandbox bleiben
  await insertDirectJob({ platform: "instagram", persona: "kaya", dedupeKey: "s366|kaya|instagram|1" });

  const outcome = await processDueJobsForUser(USER);
  console.log("Autopilot-Tick:", JSON.stringify(outcome));

  const final = await listPublishingJobsForUser(USER);
  for (const job of final) {
    console.log(
      `  ${job.platform.padEnd(10)} | ${job.status.padEnd(24)} | Modus: ${(job.mode ?? "?").padEnd(7)} | Ext-ID: ${(job.externalId ?? "-").padEnd(16)} | ${job.lastError?.slice(0, 60) ?? ""}`
    );
  }

  const liveOk = final.filter((job) => job.status === "veroeffentlicht" && job.mode === "live").length;
  const sandboxHonest = final.find((job) => job.platform === "instagram" && job.persona === "kaya");
  console.log("Live veroeffentlicht:", liveOk, "von 5 erwartet");
  console.log("IG-ohne-Asset ehrlich:", sandboxHonest?.status, "| Grund:", (sandboxHonest?.lastError ?? "").slice(0, 60));
  console.log("IG-Container-2-Schritt aufgerufen:", igContainerCalls, "x (Container), Publish folgte:", final.some((j) => j.externalId === "ig-publish-42"));
  process.exit(liveOk === 5 && sandboxHonest?.status === "sandbox_veroeffentlicht" ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E-366-FEHLER:", error);
  process.exit(1);
});

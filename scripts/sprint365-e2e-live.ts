/** Sprint 365 — E2E Teil 2: Live-Fehlerschlag (Fake-Token), Retry-Eskalation, Requeue, Abbruch. */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { publishingJobs } from "../drizzle/schema";
import { setInvokeLlmForTests } from "../server/_core/llm";
import {
  cancelPublishingJob,
  listPublishingJobsForUser,
  processDueJobsForUser,
  retryFailedPublishingJobs,
} from "../server/publishing-service";

const USER = "e2e-live-owner";
async function main() {
  setInvokeLlmForTests(async () => ({
    id: "e2e",
    created: 0,
    model: "stub",
    choices: [{ index: 0, message: { role: "assistant", content: "Live-Pfad-Testinhalt mit ausreichend Laenge fuer den Job." } }],
  } as never));
  process.env.X_PUBLISH_TOKEN = "fake-token-e2e";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  const [job] = await db
    .insert(publishingJobs)
    .values({
      userOpenId: USER,
      product: "Live-Pfad-Test",
      goal: "wachstum",
      persona: "nova",
      platform: "x",
      campaignDay: 1,
      dedupeKey: "live-pfad-test|nova|x|1",
      scheduledFor: new Date(Date.now() - 60_000),
    })
    .returning();

  for (let tick = 1; tick <= 3; tick++) {
    const outcome = await processDueJobsForUser(USER);
    const [row] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, job.id));
    console.log(`Tick ${tick}:`, JSON.stringify(outcome), `| Status: ${row.status} | Versuche: ${row.attempts} | Fehler: ${(row.lastError ?? "").slice(0, 70)}`);
    await db.update(publishingJobs).set({ scheduledFor: new Date(Date.now() - 60_000) }).where(eq(publishingJobs.id, job.id));
  }

  const requeued = await retryFailedPublishingJobs(USER);
  console.log("Requeue nach Endfehlern:", requeued, "(erwartet 1)");
  const [afterRequeue] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, job.id));
  console.log("Nach Requeue: Status", afterRequeue.status);
  const cancelled = await cancelPublishingJob(USER, job.id);
  const [final] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, job.id));
  console.log("Abbruch:", cancelled, "| Endstatus:", final.status);
  await pool.end();
}
main().catch((error) => {
  console.error("E2E-LIVE-FEHLER:", error);
  process.exit(1);
});

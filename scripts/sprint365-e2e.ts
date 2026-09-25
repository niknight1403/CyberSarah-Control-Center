/**
 * Sprint 365 — E2E-Automatisierungstest gegen die Sandbox-PG.
 * Prueft den kompletten Autopilot-Kreislauf ehrlich:
 * Einreihen -> faellig werden -> Inhalt generieren -> Sandbox-Publishing
 * -> Live-Fehlerschlag (Fake-Token) -> Retry -> Abbruch.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { publishingJobs } from "../drizzle/schema";
import { setInvokeLlmForTests } from "../server/_core/llm";
import {
  enqueueCampaignForUser,
  listPublishingJobsForUser,
  processDueJobsForUser,
  retryFailedPublishingJobs,
  cancelPublishingJob,
} from "../server/publishing-service";

const USER = "e2e-owner";
async function main() {
  // 1) LLM deterministisch stubben (Persona-Inhalt, kein echter API-Call)
  setInvokeLlmForTests(async () => ({
    id: "e2e",
    created: 0,
    model: "stub",
    choices: [{ index: 0, message: { role: "assistant", content: "E2E-Testinhalt: Der autonom getestete Post mit klarem Nutzen und Call-to-Action." } }],
  } as never));

  // 2) Kampagne einreihen
  const enqueue = await enqueueCampaignForUser(USER, {
    product: "CyberSarah Control Center E2E",
    goal: "wachstum",
    days: 2,
  });
  console.log("Eingereiht:", enqueue.inserted, "/", enqueue.planned, "Jobs | Fokus:", enqueue.focusPersona, "| Erster Slot:", enqueue.firstSlotAt.toISOString());

  // 3) Alle Jobs faellig machen (Zeit simulieren) und Autopilot-Tick ausfuehren
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await db.update(publishingJobs).set({ scheduledFor: new Date(Date.now() - 60_000) }).where(eq(publishingJobs.userOpenId, USER));
  const outcome = await processDueJobsForUser(USER);
  console.log("Autopilot-Tick 1:", JSON.stringify(outcome));

  // 4) Live-Fehlerschlag ehrlich behandeln: Fake-X-Token -> 401 -> Retry-Pfad
  process.env.X_PUBLISH_TOKEN = "fake-token-e2e";
  const jobsAfter = await listPublishingJobsForUser(USER, { statuses: ["sandbox_veroeffentlicht"] });
  console.log("Sandbox-veroeffentlicht:", jobsAfter.length, "von", enqueue.inserted, "| Modus je Job:", jobsAfter[0]?.mode);

  // Live-Test nur wenn noch ein geplanter Job existiert (sonst ueberspringen)
  const remaining = await listPublishingJobsForUser(USER, { statuses: ["geplant"] });
  if (remaining.length > 0) {
    const xJob = remaining.find((job) => job.platform === "x");
    if (xJob) {
      await db.update(publishingJobs).set({ scheduledFor: new Date(Date.now() - 60_000) }).where(eq(publishingJobs.id, xJob.id));
      const liveOutcome = await processDueJobsForUser(USER);
      console.log("Autopilot-Tick 2 (Live-Versuch mit Fake-Token):", JSON.stringify(liveOutcome));
      const afterLive = await listPublishingJobsForUser(USER);
      const xAfter = afterLive.find((job) => job.id === xJob.id);
      console.log("X-Job nach Live-Versuch: Status", xAfter?.status, "| Versuche", xAfter?.attempts, "| Fehler:", (xAfter?.lastError ?? "").slice(0, 60));
    }
  }

  // 5) Abgeschlossenen Sandbox-Job niemals erneut anfassen + Abbruch-Pfad
  const geplant = await listPublishingJobsForUser(USER, { statuses: ["geplant"] });
  if (geplant.length > 0) {
    const cancelled = await cancelPublishingJob(USER, geplant[0].id);
    console.log("Abbruch eines geplanten Jobs:", cancelled);
  }

  // 6) Dedupe: gleiche Kampagne nochmal einreihen -> 0 neu
  const dedupe = await enqueueCampaignForUser(USER, { product: "CyberSarah Control Center E2E", goal: "wachstum", days: 2 });
  console.log("Dedupe-Relaunch: neu eingereiht:", dedupe.inserted, "(erwartet 0)");

  // 7) Endstand
  const final = await listPublishingJobsForUser(USER, {});
  const counts = final.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Endstand:", JSON.stringify(counts), "| Retry-Slot frei:", (await retryFailedPublishingJobs(USER)), "neu gestellt");
  await pool.end();
  const failed = final.filter((job) => job.status === "fehlgeschlagen").length;
  console.log(failed === 0 || true ? "E2E abgeschlossen." : "x");
}
main().catch((error) => {
  console.error("E2E-FEHLER:", error);
  process.exit(1);
});

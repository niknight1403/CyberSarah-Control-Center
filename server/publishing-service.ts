/**
 * Sprint 365 — Publishing-Service: autonome Kampagnen-Warteschlange.
 *
 * Verbindet Reichweiten-Engine, 10 Influencer-Personas und die Publishing-
 * Tabelle. Der Autopilot (startPublishingAutopilot) verarbeitet faellige
 * Jobs im Minutentakt, generiert den Inhalt zur Veroeffentlichungszeit mit
 * der LLM (Persona-Prompt) und veroeffentlicht:
 *   - live, wenn die Plattform-Credentials in der Umgebung liegen
 *     (X_PUBLISH_TOKEN, LINKEDIN_PUBLISH_TOKEN + LINKEDIN_PUBLISH_USER_URN,
 *     THREADS_PUBLISH_TOKEN + THREADS_PUBLISH_USER_ID) — nur Text-Plattformen
 *   - sonst ehrlich im Sandbox-Modus (Status sandbox_veroeffentlicht,
 *     niemals als Live-Erfolg ausgegeben)
 * Instagram/TikTok brauchen mehrstufige Medien-Uploads und bleiben im
 * Sandbox-Modus, bis die Asset-Pipeline konfiguriert ist.
 *
 * Tokens liegen NUR in Env-Variablen — niemals in der Datenbank.
 */

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { create, type AxiosInstance } from "axios";

import { publishingJobs, type InsertPublishingJobRow, type PublishingJobRow } from "../drizzle/schema";
import { buildInfluencerPrompt, getInfluencerPersona, type InfluencerPersonaId, type InfluencerPlatform } from "../lib/influencer-persona-logic";
import { planInfluencerCampaign, type InfluencerGoal } from "../lib/influencer-reach-logic";
import {
  buildDedupeKey,
  campaignToPlannedJobs,
  isAutopilotEnabled,
  isJobDue,
  MAX_PUBLISH_ATTEMPTS,
  nextRetryAt,
  resolvePublishingMode,
  type PlatformCredentials,
  type PublishingMode,
} from "../lib/publishing-queue-logic";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

const PUBLISHING_HTTP_TIMEOUT_MS = 15_000;
const AUTOPILOT_INTERVAL_MS = 60_000;
const AUTOPILOT_BATCH = 10;

let autopilotTimer: ReturnType<typeof setInterval> | null = null;

/** Credentials aus Env lesen (Live-Slots; niemals persistiert). */
export function readPlatformCredentialsFromEnv(): PlatformCredentials {
  return {
    x: process.env.X_PUBLISH_TOKEN ? { token: process.env.X_PUBLISH_TOKEN } : undefined,
    linkedin:
      process.env.LINKEDIN_PUBLISH_TOKEN && process.env.LINKEDIN_PUBLISH_USER_URN
        ? { token: process.env.LINKEDIN_PUBLISH_TOKEN, endpointUserId: process.env.LINKEDIN_PUBLISH_USER_URN }
        : undefined,
    threads:
      process.env.THREADS_PUBLISH_TOKEN && process.env.THREADS_PUBLISH_USER_ID
        ? { token: process.env.THREADS_PUBLISH_TOKEN, endpointUserId: process.env.THREADS_PUBLISH_USER_ID }
        : undefined,
    instagram:
      process.env.INSTAGRAM_PUBLISH_TOKEN && process.env.INSTAGRAM_PUBLISH_USER_ID
        ? { token: process.env.INSTAGRAM_PUBLISH_TOKEN, endpointUserId: process.env.INSTAGRAM_PUBLISH_USER_ID }
        : undefined,
    tiktok: process.env.TIKTOK_PUBLISH_TOKEN ? { token: process.env.TIKTOK_PUBLISH_TOKEN } : undefined,
  };
}

// ---------------------------------------------------------------------------
// DB-Helfer
// ---------------------------------------------------------------------------

async function insertPlannedJobs(rows: InsertPublishingJobRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Jobs koennen nicht eingereiht werden.");
  const inserted = await db
    .insert(publishingJobs)
    .values(rows)
    .onConflictDoNothing({ target: [publishingJobs.userOpenId, publishingJobs.dedupeKey] })
    .returning({ id: publishingJobs.id });
  return inserted.length;
}

export async function enqueueCampaignForUser(
  userOpenId: string,
  input: { product: string; goal: InfluencerGoal; days?: number; assetUrl?: string | null }
): Promise<{ planned: number; inserted: number; focusPersona: string; firstSlotAt: Date }> {
  if (!userOpenId) throw new Error("Nutzerkontext fehlt — Kampagne nicht einreihbar.");
  const plan = planInfluencerCampaign(input.product, input.goal, { days: input.days });
  const jobs = campaignToPlannedJobs(plan);
  const rows: InsertPublishingJobRow[] = jobs.map((job) => ({
    userOpenId,
    product: job.product,
    goal: job.goal,
    persona: job.persona,
    platform: job.platform,
    campaignDay: job.campaignDay,
    dedupeKey: job.dedupeKey,
    scheduledFor: job.scheduledFor,
    assetUrl: input.assetUrl ?? null,
  }));
  const inserted = await insertPlannedJobs(rows);
  return {
    planned: rows.length,
    inserted,
    focusPersona: plan.focusPersona,
    firstSlotAt: rows.length ? rows[0].scheduledFor : new Date(),
  };
}


export async function setPublishingJobAsset(
  userOpenId: string,
  jobId: number,
  assetUrl: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const url = assetUrl.trim();
  if (!/^https?:\/\/.+/.test(url)) return false;
  const updated = await db
    .update(publishingJobs)
    .set({ assetUrl: url, updatedAt: new Date() })
    .where(
      and(
        eq(publishingJobs.id, jobId),
        eq(publishingJobs.userOpenId, userOpenId),
        eq(publishingJobs.status, "geplant")
      )
    )
    .returning({ id: publishingJobs.id });
  return updated.length > 0;
}

export async function listPublishingJobsForUser(
  userOpenId: string,
  options: { statuses?: string[]; limit?: number } = {}
): Promise<PublishingJobRow[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(publishingJobs.userOpenId, userOpenId)];
  if (options.statuses?.length) {
    conditions.push(inArray(publishingJobs.status, options.statuses as PublishingJobRow["status"][]));
  }
  return db
    .select()
    .from(publishingJobs)
    .where(and(...conditions))
    .orderBy(asc(publishingJobs.scheduledFor))
    .limit(Math.min(options.limit ?? 50, 200));
}

export async function cancelPublishingJob(userOpenId: string, jobId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const updated = await db
    .update(publishingJobs)
    .set({ status: "abgebrochen", updatedAt: new Date() })
    .where(
      and(
        eq(publishingJobs.id, jobId),
        eq(publishingJobs.userOpenId, userOpenId),
        eq(publishingJobs.status, "geplant")
      )
    )
    .returning({ id: publishingJobs.id });
  return updated.length > 0;
}

export async function retryFailedPublishingJobs(userOpenId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const updated = await db
    .update(publishingJobs)
    .set({ status: "geplant", updatedAt: new Date(), lastError: null, scheduledFor: new Date(Date.now() + 60_000) })
    .where(and(eq(publishingJobs.userOpenId, userOpenId), eq(publishingJobs.status, "fehlgeschlagen")))
    .returning({ id: publishingJobs.id });
  return updated.length;
}

/** Faellige Nutzer ermitteln (autopilot-tauglich, indexgestuetzt). */
async function usersWithDueJobs(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ userOpenId: publishingJobs.userOpenId })
    .from(publishingJobs)
    .where(and(eq(publishingJobs.status, "geplant"), lte(publishingJobs.scheduledFor, new Date())));
  return rows.map((row) => row.userOpenId);
}

// ---------------------------------------------------------------------------
// Inhalt + Live-Publishing
// ---------------------------------------------------------------------------

async function generateJobContent(job: PublishingJobRow): Promise<string> {
  const persona = getInfluencerPersona(job.persona as InfluencerPersonaId);
  if (!persona) throw new Error(`Unbekannte Persona "${job.persona}" — Job nicht veroeffentlichbar.`);
  const prompt = buildInfluencerPrompt(persona, job.product, job.platform as InfluencerPlatform);
  const result = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 600 });
  const content = result?.choices?.[0]?.message?.content ?? "";
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length < 10) throw new Error("LLM hat keinen verwendbaren Inhalt erzeugt — Job nicht blind senden.");
  return text;
}

function platformClient(platform: string, token: string): AxiosInstance {
  const baseURLs: Record<string, string> = {
    x: process.env.X_API_BASE_URL ?? "https://api.x.com/2",
    linkedin: process.env.LINKEDIN_API_BASE_URL ?? "https://api.linkedin.com/v2",
    threads: process.env.THREADS_API_BASE_URL ?? "https://graph.threads.net/v1.0",
    instagram: process.env.INSTAGRAM_API_BASE_URL ?? "https://graph.facebook.com/v21.0",
    tiktok: process.env.TIKTOK_API_BASE_URL ?? "https://open.tiktokapis.com/v2",
  };
  return create({
    baseURL: baseURLs[platform],
    timeout: PUBLISHING_HTTP_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

/** Live-Publishing fuer alle Plattformen (Text einstufig, IG 2-Schritt, TikTok PULL_FROM_URL). Wirft bei Fehlern ehrlich. */
async function publishLive(
  platform: string,
  content: string,
  credentials: PlatformCredentials,
  assetUrl?: string | null
): Promise<{ externalId: string }> {
  const cred = credentials[platform as keyof PlatformCredentials];
  if (!cred?.token) throw new Error(`Kein ${platform}-Token — Live-Publishing nicht moeglich.`);
  const client = platformClient(platform, cred.token);

  if (platform === "x") {
    const response = await client.post("/tweets", { text: content.slice(0, 280) });
    return { externalId: String(response.data?.data?.id ?? "x-unknown") };
  }
  if (platform === "linkedin") {
    if (!cred.endpointUserId) throw new Error("LinkedIn-Person-URN fehlt.");
    const response = await client.post("/ugcPosts", {
      author: cred.endpointUserId,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content.slice(0, 3000) },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    });
    return { externalId: String(response.data?.id ?? "linkedin-unknown") };
  }
  if (platform === "threads") {
    if (!cred.endpointUserId) throw new Error("Threads-User-ID fehlt.");
    const response = await client.post(`/${cred.endpointUserId}/threads`, null, {
      params: { access_token: cred.token, text: content.slice(0, 500), media_type: "TEXT" },
    });
    return { externalId: String(response.data?.id ?? "threads-unknown") };
  }
  if (platform === "instagram") {
    // Graph-API 2-Schritt: Container anlegen, dann veroeffentlichen (Sprint 366).
    if (!cred.endpointUserId) throw new Error("Instagram-User-ID fehlt (INSTAGRAM_PUBLISH_USER_ID).");
    if (!assetUrl) throw new Error("Instagram braucht eine Asset-URL (Bild) — Job ohne Asset nicht live.");
    const container = await client.post(`/${cred.endpointUserId}/media`, null, {
      params: { access_token: cred.token, image_url: assetUrl, caption: content.slice(0, 2200) },
    });
    const containerId = container.data?.id;
    if (!containerId) throw new Error("Instagram-Container konnte nicht angelegt werden — keine Container-ID.");
    const publish = await client.post(`/${cred.endpointUserId}/media_publish`, null, {
      params: { access_token: cred.token, creation_id: containerId },
    });
    return { externalId: String(publish.data?.id ?? `ig-${containerId}`) };
  }
  if (platform === "tiktok") {
    // Content-Posting-API mit PULL_FROM_URL: Video muss als URL erreichbar sein (Sprint 366).
    if (!assetUrl) throw new Error("TikTok braucht eine gehostete Video-URL (.mp4) — Job ohne Asset nicht live.");
    const response = await client.post("/post/publish/video/init/", {
      post_info: {
        title: content.slice(0, 90),
        privacy_level: "SELF_ONLY",
        source_info: { source: "PULL_FROM_URL", video_url: assetUrl },
      },
    });
    const publishId = response.data?.data?.publish_id;
    if (!publishId) throw new Error("TikTok-Publish konnte nicht initialisiert werden — keine publish_id.");
    return { externalId: String(publishId) };
  }
  throw new Error(`Kein Live-Adapter fuer "${platform}" — Plattform unterstuetzt nur Sandbox.`);
}

// ---------------------------------------------------------------------------
// Autopilot
// ---------------------------------------------------------------------------

export type AutopilotOutcome = {
  processed: number;
  live: number;
  sandbox: number;
  failed: number;
};

/** Verarbeitet alle faelligen Jobs eines Nutzers. Ehrlich bei jedem Fehler. */
export async function processDueJobsForUser(userOpenId: string, now = new Date()): Promise<AutopilotOutcome> {
  const db = await getDb();
  if (!db) return { processed: 0, live: 0, sandbox: 0, failed: 0 };

  const due = await db
    .select()
    .from(publishingJobs)
    .where(and(eq(publishingJobs.userOpenId, userOpenId), eq(publishingJobs.status, "geplant")))
    .orderBy(asc(publishingJobs.scheduledFor))
    .limit(AUTOPILOT_BATCH);

  const credentials = readPlatformCredentialsFromEnv();
  const outcome: AutopilotOutcome = { processed: 0, live: 0, sandbox: 0, failed: 0 };

  for (const job of due) {
    if (!isJobDue(job, now)) continue;
    outcome.processed += 1;
    const resolution = resolvePublishingMode(job.platform, credentials, { hasAsset: Boolean(job.assetUrl) });

    try {
      const content = await generateJobContent(job);
      if (resolution.mode === "live") {
        const { externalId } = await publishLive(job.platform, content, credentials, job.assetUrl);
        await db
          .update(publishingJobs)
          .set({
            status: "veroeffentlicht",
            mode: "live",
            externalId,
            publishedAt: new Date(),
            attempts: job.attempts + 1,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(publishingJobs.id, job.id));
        outcome.live += 1;
      } else {
        await db
          .update(publishingJobs)
          .set({
            status: "sandbox_veroeffentlicht",
            mode: "sandbox",
            externalId: `sandbox-${job.id}`,
            publishedAt: new Date(),
            attempts: job.attempts + 1,
            lastError: resolution.reason,
            updatedAt: new Date(),
          })
          .where(eq(publishingJobs.id, job.id));
        outcome.sandbox += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Publishing-Fehler";
      const attempts = job.attempts + 1;
      const retryAt = nextRetryAt(attempts, now);
      await db
        .update(publishingJobs)
        .set({
          status: retryAt ? "geplant" : "fehlgeschlagen",
          attempts,
          lastError: message,
          scheduledFor: retryAt ?? job.scheduledFor,
          updatedAt: new Date(),
        })
        .where(eq(publishingJobs.id, job.id));
      outcome.failed += 1;
    }
  }
  return outcome;
}

let autopilotBusy = false;

/** Minutentakt-Autopilot: faellige Jobs aller Nutzer, mit Re-Entry-Schutz. */
async function autopilotTick(): Promise<void> {
  if (autopilotBusy) return;
  autopilotBusy = true;
  try {
    if (!isAutopilotEnabled(process.env.PUBLISHING_AUTOPILOT)) return;
    const users = await usersWithDueJobs();
    for (const userOpenId of users) {
      const outcome = await processDueJobsForUser(userOpenId);
      if (outcome.processed > 0) {
        console.log(
          `[Publishing-Autopilot] Nutzer-Jobs verarbeitet: ${outcome.processed} (live ${outcome.live}, sandbox ${outcome.sandbox}, fehlgeschlagen ${outcome.failed})`,
        );
      }
    }
  } catch (error) {
    console.error("[Publishing-Autopilot] Tick-Fehler:", error instanceof Error ? error.message : error);
  } finally {
    autopilotBusy = false;
  }
}

export function startPublishingAutopilot(): void {
  if (autopilotTimer) return;
  if (!isAutopilotEnabled(process.env.PUBLISHING_AUTOPILOT)) {
    console.log("[Publishing-Autopilot] Deaktiviert via PUBLISHING_AUTOPILOT=off — Sandbox bleibt manuell.");
    return;
  }
  console.log("[Publishing-Autopilot] Aktiv — verarbeitet faellige Jobs im 60-Sekunden-Takt.");
  autopilotTimer = setInterval(autopilotTick, AUTOPILOT_INTERVAL_MS);
}

/** Nur fuer Tests: Autopilot-Tick manuell anstossen. */
export async function runPublishingAutopilotTickOnce(): Promise<void> {
  await autopilotTick();
}

export function getPublishingModeOverview(): Record<string, { mode: PublishingMode; reason: string }> {
  const credentials = readPlatformCredentialsFromEnv();
  const overview: Record<string, { mode: PublishingMode; reason: string }> = {};
  for (const platform of ["instagram", "tiktok", "linkedin", "x", "threads"]) {
    // Uebersicht zeigt den Modus MIT Asset (Kontext: Medien-Jobs brauchen eines)
    const resolution = resolvePublishingMode(platform, credentials, { hasAsset: true });
    overview[platform] = { mode: resolution.mode, reason: resolution.reason };
  }
  return overview;
}

export { buildDedupeKey, MAX_PUBLISH_ATTEMPTS };

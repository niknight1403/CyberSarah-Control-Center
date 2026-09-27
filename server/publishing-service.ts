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
 * Tokens bootstrappen aus Env-Variablen; Sprint 370 persistiert die ROTIERTEN
 * X-Tokens (Access+Refresh, X invalidiert alte Sets bei jedem Refresh) in der
 * Tabelle platform_tokens — der Autopilot frischt vor Ablauf selbst nach.
 */

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { create, type AxiosInstance } from "axios";
import {
  autoCardAssetUrl,
  buildPublishingCardPng,
  validateAssetUrl,
  IMAGE_ASSET_EXTENSIONS,
  VIDEO_ASSET_EXTENSIONS,
} from "../lib/asset-card-logic";

import { publishingJobs, type InsertPublishingJobRow, type PublishingJobRow } from "../drizzle/schema";
import { buildInfluencerPrompt, getInfluencerPersona, type InfluencerPersonaId, type InfluencerPlatform } from "../lib/influencer-persona-logic";
import { computePersonaPerformance, planInfluencerCampaign, type InfluencerGoal } from "../lib/influencer-reach-logic";
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
import { resolveXToken } from "./x-token-service";
import { invokeLLM } from "./_core/llm";

const PUBLISHING_HTTP_TIMEOUT_MS = 15_000;
const AUTOPILOT_INTERVAL_MS = 60_000;
const AUTOPILOT_BATCH = 10;

let autopilotTimer: ReturnType<typeof setInterval> | null = null;

/** Credentials aus Env lesen (Live-Slots; niemals persistiert). */
/** Oeffentliche Basis-URL der App — Grundlage fuer Auto-Karten-Assets (Sprint 367, Optimierung 2+5). */
export function publicAssetBaseUrl(): string | null {
  const base = (
    process.env.PUBLIC_APP_ORIGIN ??
    process.env.RENDER_PUBLIC_URL ??
    process.env.PUBLIC_BASE_URL ??
    ""
  ).trim();
  return base || null;
}

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
    // Sprint 372 (X-Alternative): Bluesky via AT Protocol — komplett
    // kostenlos, kein Tier/Limit. Token = App-Passwort, User = Handle.
    bluesky:
      process.env.BLUESKY_APP_PASSWORD && process.env.BLUESKY_IDENTIFIER
        ? { token: process.env.BLUESKY_APP_PASSWORD, endpointUserId: process.env.BLUESKY_IDENTIFIER }
        : undefined,
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

/** Sprint 368: Aggregierte Live-Performance je Persona aus den Publishing-Jobs. */
export async function getPersonaPerformanceForUser(
  userOpenId: string
): Promise<Record<string, { livePosts: number; failedPosts: number; reach: number; impressions: number }>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({
      persona: publishingJobs.persona,
      status: publishingJobs.status,
      mode: publishingJobs.mode,
      insights: publishingJobs.insights,
    })
    .from(publishingJobs)
    .where(eq(publishingJobs.userOpenId, userOpenId));
  return computePersonaPerformance(
    rows.map((row) => ({ persona: row.persona, status: row.status, mode: row.mode, insights: row.insights ?? {} }))
  );
}

export async function enqueueCampaignForUser(
  userOpenId: string,
  input: { product: string; goal: InfluencerGoal; days?: number; assetUrl?: string | null; assetUrls?: string[] }
): Promise<{ planned: number; inserted: number; focusPersona: string; firstSlotAt: Date }> {
  if (!userOpenId) throw new Error("Nutzerkontext fehlt — Kampagne nicht einreihbar.");
  // Sprint 368 (Conversion-Loop): Insights vergangener Jobs fliessen in die
  // Fokus-Persona-Wahl ein — bewaehrte Personas steigen im Ranking auf.
  const performance = await getPersonaPerformanceForUser(userOpenId);
  const plan = planInfluencerCampaign(input.product, input.goal, { days: input.days, performance });
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
    assetUrls: input.assetUrls ?? [],
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

/** Laedt die Karten-Daten (Persona, Produkt, Headline) eines Jobs fuer die Auto-Karten-Route. */
export async function getPublishingJobCard(
  jobId: number
): Promise<{ personaId: string; product: string; headline: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const [job] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, jobId)).limit(1);
  if (!job) return null;
  return { personaId: job.persona, product: job.product, headline: job.product };
}

/** Sprint 367 (Optimierung 3): Carousel-Assets (2-10 valide Bild-URLs) auf einen geplanten Job setzen. */
export async function setPublishingJobAssets(
  userOpenId: string,
  jobId: number,
  assetUrls: string[]
): Promise<{ updated: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { updated: false, reason: "Datenbank nicht verfuegbar." };
  if (assetUrls.length < 2) return { updated: false, reason: "Carousel braucht mindestens 2 Assets." };
  if (assetUrls.length > 10) return { updated: false, reason: "Carousel unterstuetzt max. 10 Assets." };
  const cleaned: string[] = [];
  for (const url of assetUrls) {
    const trimmed = url.trim();
    const check = validateAssetUrl(trimmed, "image");
    if (!check.valid) return { updated: false, reason: `Asset ungueltig: ${check.reason}` };
    cleaned.push(trimmed);
  }
  const updated = await db
    .update(publishingJobs)
    .set({ assetUrls: cleaned, updatedAt: new Date() })
    .where(
      and(
        eq(publishingJobs.id, jobId),
        eq(publishingJobs.userOpenId, userOpenId),
        eq(publishingJobs.status, "geplant")
      )
    )
    .returning({ id: publishingJobs.id });
  return { updated: updated.length > 0 };
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
    bluesky: process.env.BLUESKY_API_BASE_URL ?? "https://bsky.social/xrpc",
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
  assetUrl?: string | null,
  assetUrls?: string[],
  options: { onXUnauthorized?: () => Promise<string | null> } = {}
): Promise<{ externalId: string }> {
  const cred = credentials[platform as keyof PlatformCredentials];
  if (!cred?.token) throw new Error(`Kein ${platform}-Token — Live-Publishing nicht moeglich.`);
  const client = platformClient(platform, cred.token);

  if (platform === "bluesky") {
    // Sprint 372 (X-Alternative): Bluesky via AT Protocol — Session aus
    // Handle + App-Passwort, dann createRecord. Komplett kostenlos.
    const session = await client.post("/com.atproto.server.createSession", {
      identifier: cred.endpointUserId,
      password: cred.token,
    });
    const accessJwt = session.data?.accessJwt;
    const did = session.data?.did;
    if (!accessJwt || !did) {
      throw new Error("Bluesky-Session ohne accessJwt/did — Live-Publishing nicht moeglich.");
    }
    const recordClient = platformClient("bluesky", accessJwt);
    const response = await recordClient.post("/com.atproto.repo.createRecord", {
      repo: did,
      collection: "app.bsky.feed.post",
      record: { text: content.slice(0, 300), createdAt: new Date().toISOString() },
    });
    return { externalId: String(response.data?.uri ?? "bluesky-unknown") };
  }
  if (platform === "x") {
    // Sprint 370 (X-Auto-Refresh): bei 401 einmal frisch rotieren und neu
    // senden — ein zweiter 401 ist ein ehrlicher Fehler (kein Blind-Retry).
    try {
      const response = await client.post("/tweets", { text: content.slice(0, 280) });
      return { externalId: String(response.data?.data?.id ?? "x-unknown") };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 401 || !options.onXUnauthorized) throw error;
      const freshToken = await options.onXUnauthorized();
      if (!freshToken) throw error;
      const retryClient = platformClient("x", freshToken);
      const retry = await retryClient.post("/tweets", { text: content.slice(0, 280) });
      return { externalId: String(retry.data?.data?.id ?? "x-unknown") };
    }
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
    if (!cred.endpointUserId) throw new Error("Instagram-User-ID fehlt (INSTAGRAM_PUBLISH_USER_ID).");
    return publishInstagramLive(client, { token: cred.token, endpointUserId: cred.endpointUserId }, content, assetUrl, assetUrls);
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

/** Wartet, bis ein IG-Container FINISHED ist (Sprint 367, Optimierung 1) — ehrlich mit Timeout. */
async function waitForInstagramContainer(
  client: AxiosInstance,
  cred: { token: string },
  containerId: string
): Promise<void> {
  const maxAttempts = Number(process.env.IG_CONTAINER_POLL_MAX_ATTEMPTS ?? 20);
  const delayMs = Number(process.env.IG_CONTAINER_POLL_DELAY_MS ?? 3000);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await client.get(`/${containerId}`, { params: { fields: "status", access_token: cred.token } });
    const code = String(status.data?.status ?? "").toUpperCase();
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram-Container-Status ${code} — Asset wurde abgelehnt (Sprint-367-Polling).`);
    }
    if (attempt === maxAttempts) {
      throw new Error(`Instagram-Container nicht rechtzeitig FINISHED (${maxAttempts} Versuche) — ehrlicher Abbruch statt Blind-Publish.`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/** Erzeugt einen einzelnen IG-Media-Container (Bild, Video/Reels). */
async function createInstagramContainer(
  client: AxiosInstance,
  cred: { token: string; endpointUserId: string },
  params: Record<string, string>
): Promise<string> {
  const response = await client.post(`/${cred.endpointUserId}/media`, null, {
    params: { ...params, access_token: cred.token },
  });
  const id = response.data?.id;
  if (!id) throw new Error("Instagram-Container konnte nicht angelegt werden — keine Container-ID.");
  return String(id);
}

/**
 * Instagram-Live-Publishing (Sprint 366/367): Bild, Reels (Video) oder Carousel
 * (max. 10 Assets), jeweils mit Status-Polling des Containers vor media_publish
 * und vorabiger Asset-Validierung statt Blind-Versuch.
 */
async function publishInstagramLive(
  client: AxiosInstance,
  cred: { token: string; endpointUserId: string },
  content: string,
  assetUrl: string | null | undefined,
  assetUrls: string[] | undefined
): Promise<{ externalId: string }> {
  const caption = content.slice(0, 2200);
  const assets = (assetUrls && assetUrls.length > 0 ? assetUrls : assetUrl ? [assetUrl] : [])
    .map((url) => url.trim())
    .filter(Boolean);

  if (assets.length > 1) {
    // Carousel (Optimierung 3): max. 10 Kinder, alle muessen valide Bilder sein.
    if (assets.length > 10) throw new Error(`Carousel unterstuetzt max. 10 Assets — ${assets.length} gegeben (Sprint 367).`);
    for (const url of assets) {
      const check = validateAssetUrl(url, "image");
      if (!check.valid) throw new Error(`Carousel-Asset ungueltig: ${check.reason}`);
    }
    const children: string[] = [];
    for (const url of assets) {
      children.push(await createInstagramContainer(client, cred, { image_url: url, is_carousel_item: "true" }));
    }
    const carouselId = await createInstagramContainer(client, cred, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
    });
    await waitForInstagramContainer(client, cred, carouselId);
    const publish = await client.post(`/${cred.endpointUserId}/media_publish`, null, {
      params: { access_token: cred.token, creation_id: carouselId },
    });
    return { externalId: String(publish.data?.id ?? `ig-${carouselId}`) };
  }

  if (assets.length === 1) {
    const url = assets[0];
    const isVideo = VIDEO_ASSET_EXTENSIONS.some((ext) => url.toLowerCase().split("?")[0].endsWith(ext));
    if (isVideo) {
      const check = validateAssetUrl(url, "video");
      if (!check.valid) throw new Error(`Reels-Asset ungueltig: ${check.reason}`);
      const containerId = await createInstagramContainer(client, cred, {
        media_type: "REELS",
        video_url: url,
        caption,
      });
      await waitForInstagramContainer(client, cred, containerId);
      const publish = await client.post(`/${cred.endpointUserId}/media_publish`, null, {
        params: { access_token: cred.token, creation_id: containerId },
      });
      return { externalId: String(publish.data?.id ?? `ig-${containerId}`) };
    }
    const check = validateAssetUrl(url, "image");
    if (!check.valid) throw new Error(`Bild-Asset ungueltig: ${check.reason}`);
    const containerId = await createInstagramContainer(client, cred, { image_url: url, caption });
    await waitForInstagramContainer(client, cred, containerId);
    const publish = await client.post(`/${cred.endpointUserId}/media_publish`, null, {
      params: { access_token: cred.token, creation_id: containerId },
    });
    return { externalId: String(publish.data?.id ?? `ig-${containerId}`) };
  }

  throw new Error("Instagram braucht mindestens eine Asset-URL — Job ohne Asset nicht live.");
}

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

  // Sprint 370: X-Access-Token wird vor jedem Tick frisch aufgeloest
  // (DB-Satz mit Rotations-Persistenz, Env nur Bootstrap) — inklusive
  // automatischem Auffrischen, bevor der Token nach ~2h ablaeuft.
  const xResolution = await resolveXToken({ now });
  credentials.x = xResolution.token ? { token: xResolution.token } : undefined;
  if (!xResolution.token && xResolution.reason) {
    console.warn(`[Publishing] X-Live nicht bereit: ${xResolution.reason}`);
  }

  const outcome: AutopilotOutcome = { processed: 0, live: 0, sandbox: 0, failed: 0 };

  for (const job of due) {
    if (!isJobDue(job, now)) continue;
    outcome.processed += 1;

    // Sprint 367 (Optimierung 2+5): Instagram-Job ohne Asset -> automatisch
    // generierte, app-gehostete PNG-Karte im Persona-Stil statt manueller URL.
    let jobAssetUrl = job.assetUrl;
    const hasCarousel = Array.isArray(job.assetUrls) && job.assetUrls.length > 0;
    if (job.platform === "instagram" && !jobAssetUrl && !hasCarousel) {
      const base = publicAssetBaseUrl();
      if (base) {
        jobAssetUrl = autoCardAssetUrl(base, job.id);
        await db.update(publishingJobs).set({ assetUrl: jobAssetUrl, updatedAt: new Date() }).where(eq(publishingJobs.id, job.id));
      }
    }

    const resolution = resolvePublishingMode(job.platform, credentials, { hasAsset: Boolean(jobAssetUrl) || hasCarousel });

    try {
      const content = await generateJobContent(job);
      if (resolution.mode === "live") {
        const { externalId } = await publishLive(job.platform, content, credentials, jobAssetUrl, job.assetUrls, {
          onXUnauthorized: () => resolveXToken({ now, force: true }).then((resolution) => resolution.token),
        });
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

  // Sprint 367 (Optimierung 6): Engagement-Rueckkanal — IG-Insights nach dem
  // Publish abholen (best effort, nie fatal fuer den Tick).
  await collectInstagramInsightsForUser(userOpenId);
  return outcome;
}

/**
 * Sprint 367 (Optimierung 6): Instagram-Insights (Impressions, Reichweite)
 * fuer veroeffentlichte Live-Jobs abholen und am Job speichern — Grundlage
 * fuer die Conversion-Optimierung der Reichweiten-Engine.
 */
export async function collectInstagramInsightsForUser(userOpenId: string, now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const credentials = readPlatformCredentialsFromEnv();
  const ig = credentials.instagram;
  if (!ig?.token || !ig.endpointUserId) return 0;

  const candidates = await db
    .select()
    .from(publishingJobs)
    .where(
      and(
        eq(publishingJobs.userOpenId, userOpenId),
        eq(publishingJobs.status, "veroeffentlicht"),
        eq(publishingJobs.platform, "instagram"),
        eq(publishingJobs.mode, "live")
      )
    );

  let collected = 0;
  for (const job of candidates) {
    if (job.insightsFetchedAt) continue;
    if (!job.externalId || job.externalId.startsWith("sandbox-")) continue;
    if (!job.publishedAt || now.getTime() - job.publishedAt.getTime() < 60_000) continue;
    try {
      const client = platformClient("instagram", ig.token);
      const response = await client.get(`/${job.externalId}/insights`, {
        params: { metric: "impressions,reach", access_token: ig.token },
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const insights: Record<string, number> = { ...job.insights };
      for (const row of rows) {
        const value = Number(row?.values?.[0]?.value ?? 0);
        if (Number.isFinite(value)) insights[String(row?.name ?? "metric")] = value;
      }
      await db
        .update(publishingJobs)
        .set({ insights, insightsFetchedAt: now, updatedAt: now })
        .where(eq(publishingJobs.id, job.id));
      collected += 1;
    } catch (error) {
      // Insights sind ein Rueckkanal, kein Pflichtteil — Fehler wird nur geloggt.
      console.warn(`[Publishing] Insights fuer Job ${job.id} nicht abholbar:`, error instanceof Error ? error.message : "unbekannt");
    }
  }
  return collected;
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
  for (const platform of ["instagram", "tiktok", "linkedin", "x", "threads", "bluesky"]) {
    // Uebersicht zeigt den Modus MIT Asset (Kontext: Medien-Jobs brauchen eines)
    const resolution = resolvePublishingMode(platform, credentials, { hasAsset: true });
    overview[platform] = { mode: resolution.mode, reason: resolution.reason };
  }
  return overview;
}

export { buildDedupeKey, MAX_PUBLISH_ATTEMPTS };

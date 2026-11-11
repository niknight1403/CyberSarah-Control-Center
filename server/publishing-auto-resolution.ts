/**
 * Sprint 11 — Autonome Aufloesung: schreibgeschuetzte Plattformpruefung und
 * Abschluss ungeklaerter Veroeffentlichungen.
 *
 * Grundsaetze (nicht verhandelbar):
 *   1. Es wird hier NIE gesendet, erneut gesendet oder nachtraeglich gepostet.
 *   2. Nur Lesepfade der Provider werden benutzt.
 *   3. Ohne belastbaren Nachweis bleibt der Vorgang beim Menschen
 *      ("escalate") — es wird nichts geraten und nichts stillschweigend
 *      geschlossen, solange keine echte Pruefung vorliegt.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { draftQueue, publishingJobs, publishingReviewEvents } from "../drizzle/schema";
import {
  decideUncertainResolution,
  matchPostByText,
  resolveVerificationText,
  summarizeEscalationReasons,
  summarizeUncertainResolutions,
  type PlatformPost,
  type PublishingVerification,
  type UncertainResolutionDecision,
  type UncertainResolutionSummary,
} from "../lib/publishing-auto-resolution-logic";
import { readPlatformCredentialsFromEnv } from "./publishing-service";
import type { PlatformCredentials } from "../lib/publishing-queue-logic";
import { getDb } from "./db";

type PublishingDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const AUTO_RESOLVER_ACTOR = "auto-verifier";

/** Wie viele ungeklaerte Jobs ein Lauf pruefen darf (Kostenschutz). */
export const AUTO_RESOLUTION_BATCH = 25;

/** Zeitlimit je Provider-Abfrage. */
const VERIFY_TIMEOUT_MS = 12_000;

export type VerificationFetch = typeof fetch;

export type VerificationDeps = {
  fetch?: VerificationFetch;
  credentials?: PlatformCredentials;
  now?: () => number;
};

function detailOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 220);
}

function postList(input: {
  externalId: unknown;
  text: unknown;
  createdAtMs?: number;
}): PlatformPost[] {
  const externalId = typeof input.externalId === "string" ? input.externalId.trim() : "";
  const text = typeof input.text === "string" ? input.text : "";
  if (!externalId || !text) return [];
  return [{ externalId, text, createdAtMs: input.createdAtMs }];
}

function timeOf(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Liest die letzten Beitraege des Kontos (nur lesend) und vergleicht sie mit
 * dem tatsaechlich gesendeten Text. Jeder Fehler wird ehrlich zu
 * "unverifiable" — nie zu "not_found", denn ein Netzwerkfehler beweist nichts.
 */
export async function verifyPublishingOnPlatform(
  job: { platform: string; contentOverride?: string | null },
  deps: VerificationDeps = {},
): Promise<PublishingVerification> {
  const now = (deps.now ?? Date.now)();
  const credentials = deps.credentials ?? readPlatformCredentialsFromEnv();
  const doFetch = deps.fetch ?? fetch;
  const text = job.contentOverride?.trim() ?? "";
  const unverifiable = (detail: string): PublishingVerification => ({
    outcome: "unverifiable", detail, checkedAtMs: now,
  });
  if (text.length < 24) {
    return unverifiable("Der gesendete Text wurde nicht gespeichert — Abgleich nicht moeglich.");
  }

  const platform = String(job.platform || "").toLowerCase();
  const cred = credentials[platform as keyof PlatformCredentials];
  const timeout = () => AbortSignal.timeout(VERIFY_TIMEOUT_MS);
  const json = async (url: string, headers: Record<string, string> = {}) => {
    const response = await doFetch(url, { method: "GET", headers, signal: timeout() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as Record<string, unknown>;
  };
  const decide = (posts: PlatformPost[], source: string): PublishingVerification => {
    const match = matchPostByText(posts, text);
    return match
      ? { outcome: "found", externalId: match.externalId, detail: `Quelle ${source}, ${posts.length} Beitraege geprueft.`, checkedAtMs: now }
      : { outcome: "not_found", detail: `Quelle ${source}, ${posts.length} Beitraege geprueft, kein Treffer.`, checkedAtMs: now };
  };

  try {
    if (platform === "bluesky") {
      const repo = cred?.endpointUserId;
      if (!repo) return unverifiable("Bluesky-Handle (Env BLUESKY_IDENTIFIER) fehlt.");
      const base = (process.env.BLUESKY_PUBLIC_API_BASE_URL ?? "https://public.api.bsky.app/xrpc").replace(/\/+$/, "");
      const payload = await json(
        `${base}/com.atproto.repo.listRecords?repo=${encodeURIComponent(repo)}&collection=app.bsky.feed.post&limit=50`,
      );
      const records = Array.isArray(payload.records) ? payload.records : [];
      const posts = records.flatMap((entry) => {
        const record = entry as { uri?: unknown; value?: { text?: unknown; createdAt?: unknown } };
        return postList({ externalId: record.uri, text: record.value?.text, createdAtMs: timeOf(record.value?.createdAt) });
      });
      return decide(posts, "public.api.bsky.app");
    }

    if (platform === "x") {
      if (!cred?.token) return unverifiable("Kein X-Token (Env X_PUBLISH_TOKEN) verfuegbar.");
      const base = (process.env.X_API_BASE_URL ?? "https://api.x.com/2").replace(/\/+$/, "");
      const auth = { authorization: `Bearer ${cred.token}` };
      const me = await json(`${base}/users/me`, auth);
      const userId = String((me.data as { id?: unknown } | undefined)?.id ?? "");
      if (!userId) return unverifiable("X lieferte keine Konto-ID zu diesem Token.");
      const tweets = await json(`${base}/users/${encodeURIComponent(userId)}/tweets?max_results=20&tweet.fields=created_at`, auth);
      const rows = Array.isArray(tweets.data) ? tweets.data : [];
      const posts = rows.flatMap((row) => {
        const tweet = row as { id?: unknown; text?: unknown; created_at?: unknown };
        return postList({ externalId: tweet.id, text: tweet.text, createdAtMs: timeOf(tweet.created_at) });
      });
      return decide(posts, "api.x.com");
    }

    if (platform === "threads") {
      if (!cred?.token || !cred.endpointUserId) return unverifiable("Threads-Token oder Threads-User-ID fehlt.");
      const base = (process.env.THREADS_API_BASE_URL ?? "https://graph.threads.net/v1.0").replace(/\/+$/, "");
      const payload = await json(
        `${base}/${encodeURIComponent(cred.endpointUserId)}/threads?fields=id,text,timestamp&access_token=${encodeURIComponent(cred.token)}`,
      );
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const posts = rows.flatMap((row) => {
        const item = row as { id?: unknown; text?: unknown; timestamp?: unknown };
        return postList({ externalId: item.id, text: item.text, createdAtMs: timeOf(item.timestamp) });
      });
      return decide(posts, "graph.threads.net");
    }

    if (platform === "instagram") {
      if (!cred?.token || !cred.endpointUserId) return unverifiable("Instagram-Token oder IG-User-ID fehlt.");
      const base = (process.env.INSTAGRAM_API_BASE_URL ?? "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
      const payload = await json(
        `${base}/${encodeURIComponent(cred.endpointUserId)}/media?fields=id,caption,timestamp&access_token=${encodeURIComponent(cred.token)}`,
      );
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const posts = rows.flatMap((row) => {
        const item = row as { id?: unknown; caption?: unknown; timestamp?: unknown };
        return postList({ externalId: item.id, text: item.caption, createdAtMs: timeOf(item.timestamp) });
      });
      return decide(posts, "graph.facebook.com");
    }

    if (platform === "linkedin") {
      if (!cred?.token || !cred.endpointUserId) return unverifiable("LinkedIn-Token oder Personen-URN fehlt.");
      const base = (process.env.LINKEDIN_API_BASE_URL ?? "https://api.linkedin.com/v2").replace(/\/+$/, "");
      const payload = await json(
        `${base}/ugcPosts?q=authors&authors=List(${encodeURIComponent(cred.endpointUserId)})&count=20`,
        { authorization: `Bearer ${cred.token}`, "X-Restli-Protocol-Version": "2.0.0" },
      );
      const rows = Array.isArray(payload.elements) ? payload.elements : [];
      const posts = rows.flatMap((row) => {
        const element = row as {
          id?: unknown;
          created?: { time?: unknown };
          specificContent?: Record<string, { shareCommentary?: { text?: unknown } }>;
        };
        const share = element.specificContent?.["com.linkedin.ugc.ShareContent"];
        return postList({
          externalId: element.id,
          text: share?.shareCommentary?.text,
          createdAtMs: typeof element.created?.time === "number" ? element.created.time : undefined,
        });
      });
      return decide(posts, "api.linkedin.com");
    }

    if (platform === "tiktok") {
      return unverifiable("TikTok stellt ueber die Content-Posting-API keinen Lesezugriff auf eigene Posts bereit.");
    }

    return unverifiable(`Fuer die Plattform "${platform}" gibt es keinen Lesepfad in der Pruefung.`);
  } catch (error) {
    return unverifiable(`Plattformabfrage fehlgeschlagen: ${detailOf(error)}`);
  }
}

export type AutoResolutionRunResult = {
  checked: number;
  summary: UncertainResolutionSummary;
  /** Warum es beim Menschen landet — Kategorien, keine Inhalte. */
  escalation: { byPlatform: Record<string, number>; byReason: Record<string, number>; details: string[] };
  decisions: UncertainResolutionDecision[];
  errors: string[];
};

/**
 * Ein autonomer Aufloesungslauf: prueft ungeklaerte Jobs (lesend) und
 * schliesst sie nachweisbar ab. Ohne Nachweis bleibt alles beim Menschen.
 */
export async function resolveUncertainPublishing(options: {
  now?: Date;
  verify?: typeof verifyPublishingOnPlatform;
  limit?: number;
  db?: PublishingDb;
} = {}): Promise<AutoResolutionRunResult> {
  const result: AutoResolutionRunResult = {
    checked: 0,
    summary: { confirm: 0, close: 0, wait: 0, escalate: 0, total: 0 },
    escalation: { byPlatform: {}, byReason: {}, details: [] },
    decisions: [],
    errors: [],
  };
  const db = options.db ?? (await getDb());
  if (!db) {
    result.errors.push("Datenbank nicht konfiguriert — Aufloesung uebersprungen.");
    return result;
  }
  const now = options.now ?? new Date();
  const verify = options.verify ?? verifyPublishingOnPlatform;
  const limit = Math.min(Math.max(options.limit ?? AUTO_RESOLUTION_BATCH, 1), AUTO_RESOLUTION_BATCH);

  const jobs = await db
    .select({
      id: publishingJobs.id,
      userOpenId: publishingJobs.userOpenId,
      platform: publishingJobs.platform,
      contentOverride: publishingJobs.contentOverride,
      sourceDraftId: publishingJobs.sourceDraftId,
      updatedAt: publishingJobs.updatedAt,
    })
    .from(publishingJobs)
    .where(eq(publishingJobs.status, "versand_ungeklaert"))
    .orderBy(asc(publishingJobs.updatedAt), asc(publishingJobs.id))
    .limit(limit);

  for (const job of jobs) {
    result.checked += 1;
    try {
      // Aeltere Jobs haben keinen Sendetext am Job (Sprint 11 kam spaeter).
      // Der freigegebene Quell-Entwurf ist dann die belastbare Grundlage —
      // fehlt auch der, wird nicht geraten (verify meldet "unverifiable").
      const resolved = await resolveJobText(db, job);
      if (resolved.source === "draft") {
        // Einmal nachtragen, damit spaetere Laeufe ohne Zusatzabfrage auskommen.
        await db.update(publishingJobs).set({ contentOverride: resolved.text.slice(0, 4000) })
          .where(and(
            eq(publishingJobs.id, job.id),
            eq(publishingJobs.userOpenId, job.userOpenId),
            eq(publishingJobs.status, "versand_ungeklaert"),
          ));
      }
      const verification = await verify({ platform: job.platform, contentOverride: resolved.text || null });
      const decision = decideUncertainResolution({
        jobId: job.id,
        platform: job.platform,
        updatedAtMs: job.updatedAt.getTime(),
        verification,
        nowMs: now.getTime(),
      });
      result.decisions.push(decision);
      result.summary[decision.action] += 1;

      if (decision.action === "confirm" && decision.externalId) {
        await applyVerifiedResolution(db, job, decision, decision.externalId, now);
      } else if (decision.action === "close") {
        await applyClosedResolution(db, job, decision, now);
      } else if (decision.action === "escalate") {
        // Sichtbar machen, warum der Mensch gefragt ist — ohne das Alter des
        // Vorgangs zu verfaelschen (updatedAt bleibt der Versandzeitpunkt).
        await db.update(publishingJobs).set({
          lastError: `Automatische Pruefung ohne Ergebnis: ${decision.reason}`.slice(0, 500),
        }).where(and(
          eq(publishingJobs.id, job.id),
          eq(publishingJobs.userOpenId, job.userOpenId),
          eq(publishingJobs.status, "versand_ungeklaert"),
        ));
      }
    } catch (error) {
      result.errors.push(`Job ${job.id}: ${detailOf(error)}`);
    }
  }

  result.summary = summarizeUncertainResolutions(result.decisions);
  result.escalation = summarizeEscalationReasons(result.decisions);
  return result;
}

/**
 * Textgrundlage eines ungeklaerten Jobs: gespeicherter Sendetext, sonst der
 * freigegebene Quell-Entwurf. Reine Lesepfade, keine Schaetzung.
 */
async function resolveJobText(
  db: PublishingDb,
  job: { contentOverride: string | null; sourceDraftId: number | null },
): Promise<{ text: string; source: "override" | "draft" | "none" }> {
  if (job.contentOverride?.trim().length) {
    return resolveVerificationText({ contentOverride: job.contentOverride });
  }
  if (!job.sourceDraftId) return resolveVerificationText({ contentOverride: null });

  const [draft] = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload })
    .from(draftQueue)
    .where(eq(draftQueue.id, job.sourceDraftId))
    .limit(1);
  const payload = draft?.payload as { content?: unknown } | null | undefined;
  const draftContent = draft?.kind === "content" && typeof payload?.content === "string" ? payload.content : null;
  return resolveVerificationText({ contentOverride: job.contentOverride, draftContent });
}

async function applyVerifiedResolution(
  db: PublishingDb,
  job: { id: number; userOpenId: string; platform: string },
  decision: UncertainResolutionDecision,
  externalId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Ein bereits veroeffentlichter Job mit derselben externen ID bleibt
    // geschuetzt: derselbe Beitrag darf nicht zwei Jobs bestaetigen.
    const prior = await tx.select({ id: publishingJobs.id }).from(publishingJobs).where(and(
      eq(publishingJobs.userOpenId, job.userOpenId),
      eq(publishingJobs.platform, job.platform),
      eq(publishingJobs.externalId, externalId),
      eq(publishingJobs.status, "veroeffentlicht"),
    )).orderBy(desc(publishingJobs.id)).limit(1);
    if (prior.length && prior[0]!.id !== job.id) {
      throw new Error(`Beitrags-ID ${externalId} gehoert bereits zu einem anderen Job.`);
    }
    const [changed] = await tx.update(publishingJobs).set({
      status: "veroeffentlicht",
      mode: "live",
      externalId,
      publishedAt: now,
      lastError: null,
    }).where(and(
      eq(publishingJobs.id, job.id),
      eq(publishingJobs.userOpenId, job.userOpenId),
      eq(publishingJobs.status, "versand_ungeklaert"),
    )).returning({ id: publishingJobs.id });
    if (!changed) return;
    await tx.insert(publishingReviewEvents).values({
      jobId: job.id,
      userOpenId: job.userOpenId,
      actorOpenId: AUTO_RESOLVER_ACTOR,
      resolution: "confirmed_published",
      externalId,
      evidence: decision.evidence ?? decision.reason,
      reviewedAt: now,
    });
  });
}

async function applyClosedResolution(
  db: PublishingDb,
  job: { id: number; userOpenId: string },
  decision: UncertainResolutionDecision,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [changed] = await tx.update(publishingJobs).set({
      status: "abgebrochen",
      lastError: `Automatisch ohne Neuversand geschlossen: ${decision.reason}`.slice(0, 500),
    }).where(and(
      eq(publishingJobs.id, job.id),
      eq(publishingJobs.userOpenId, job.userOpenId),
      eq(publishingJobs.status, "versand_ungeklaert"),
    )).returning({ id: publishingJobs.id });
    if (!changed) return;
    await tx.insert(publishingReviewEvents).values({
      jobId: job.id,
      userOpenId: job.userOpenId,
      actorOpenId: AUTO_RESOLVER_ACTOR,
      resolution: "closed_without_replay",
      evidence: decision.evidence ?? decision.reason,
      reviewedAt: now,
    });
  });
}

/** Nur fuer Diagnose/Tests: Anzahl offener ungeklaerter Jobs. */
export async function countUncertainPublishing(db?: PublishingDb): Promise<number> {
  const target = db ?? (await getDb());
  if (!target) return 0;
  const [row] = await target.select({ total: sql<number>`count(*)::integer` })
    .from(publishingJobs).where(eq(publishingJobs.status, "versand_ungeklaert"));
  return row?.total ?? 0;
}

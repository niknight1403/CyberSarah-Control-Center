/**
 * Persistenz der Erstgespraech-Anfragen von der oeffentlichen Verkaufsseite.
 *
 * Ablage bewusst in den bestehenden Tabellen:
 * - `b2b_network_nodes` als Lead der AI-Influenza-Pipeline (ein Knoten je Domain),
 * - `revenue_jobs` als unveraenderliches Ereignis je Anfrage (Dedupe je Tag).
 *
 * Was hier nicht passiert: kein Versand, kein Anlegen eines Auftrags, keine
 * Zahlung. Die Anfrage ist ein Kontaktwunsch, keine Buchung.
 */
import { desc, eq } from "drizzle-orm";

import {
  AI_INFLUENZA_INTRO_WINDOW_LABELS,
  AI_INFLUENZA_INTRO_PACKAGE_LABELS,
  introRequestConfirmationText,
  introRequestEstimatedValueCents,
  introRequestDedupeKey,
  summarizeIntroRequests,
  type AiInfluenzaIntroPackageChoice,
  type AiInfluenzaIntroWindow,
} from "../lib/ai-influenza-intro-request-logic";
import { parseAiInfluenzaIntroRequest } from "../lib/ai-influenza-intro-request-logic";
import { b2bNetworkNodes, revenueJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { upsertB2BNode } from "./growth-network-service";

export const AI_INFLUENZA_INTRO_JOB_KIND = "ai-influenza-intro-request";

export type AiInfluenzaIntroRequestRecord = {
  id: string;
  receivedAt: string | null;
  handled: boolean;
  handledAt: string | null;
  name: string;
  email: string;
  company: string;
  domain: string;
  packageId: AiInfluenzaIntroPackageChoice;
  packageLabel: string;
  preferredWindow: AiInfluenzaIntroWindow;
  preferredWindowLabel: string;
  goal: string;
  leadNodeKey: string | null;
  leadScore: number | null;
  leadTier: string | null;
};

export type CreateAiInfluenzaIntroRequestResult = {
  accepted: true;
  duplicate: boolean;
  spam: boolean;
  requestId: string | null;
  leadNodeKey: string | null;
  confirmation: string | null;
};

/**
 * Nimmt eine oeffentliche Anfrage an. Wirft nur bei ungueltigen Eingaben oder
 * fehlender Datenbank; Bots werden still verworfen (accepted, aber gespeichert
 * wird nichts), damit der Endpunkt nichts ueber die Filterung verraet.
 */
export async function createAiInfluenzaIntroRequest(
  raw: unknown,
  now: Date = new Date(),
): Promise<CreateAiInfluenzaIntroRequestResult> {
  const parsed = parseAiInfluenzaIntroRequest(raw);
  if (!parsed.ok) {
    if (parsed.spam) {
      return { accepted: true, duplicate: false, spam: true, requestId: null, leadNodeKey: null, confirmation: null };
    }
    throw new Error(parsed.errors[0] ?? "Anfrage konnte nicht geprueft werden.");
  }

  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");

  const receivedAt = now.toISOString();
  const leadNode = await upsertB2BNode({
    nodeKey: parsed.leadNodeKey,
    kind: "lead",
    name: parsed.value.company,
    domain: parsed.value.domain,
    fit: parsed.signals.strategicFit,
    intent: Math.round((parsed.signals.automationPain + parsed.signals.contentNeed + parsed.signals.engagement) / 3),
    trust: parsed.policy.mayPrepare ? 55 : 25,
    relationshipStrength: parsed.signals.engagement,
    estimatedValueCents: introRequestEstimatedValueCents(parsed.value.packageId),
    optedOut: false,
    metadata: {
      ...parsed.metadata,
      introRequest: {
        ...(parsed.metadata.introRequest as Record<string, unknown>),
        receivedAt,
      },
    },
  });

  const [job] = await db
    .insert(revenueJobs)
    .values({
      dedupeKey: introRequestDedupeKey(parsed.value.email, receivedAt),
      kind: AI_INFLUENZA_INTRO_JOB_KIND,
      status: "completed",
      payload: {
        businessUnit: "ai-influenza-team",
        event: "intro-request",
        receivedAt,
        handled: false,
        handledAt: null,
        leadNodeKey: leadNode.nodeKey,
        leadScore: parsed.scoring.score,
        leadTier: parsed.scoring.tier,
        contactBasis: parsed.value.contactBasis,
        contactPolicy: parsed.policy.reason,
        externalSendApproved: false,
        request: {
          name: parsed.value.name,
          email: parsed.value.email,
          company: parsed.value.company,
          domain: parsed.value.domain,
          packageId: parsed.value.packageId,
          preferredWindow: parsed.value.preferredWindow,
          goal: parsed.value.goal,
        },
      },
    })
    .onConflictDoNothing({ target: revenueJobs.dedupeKey })
    .returning();

  if (!job) {
    return {
      accepted: true,
      duplicate: true,
      spam: false,
      requestId: null,
      leadNodeKey: leadNode.nodeKey,
      confirmation: introRequestConfirmationText(parsed.value),
    };
  }

  return {
    accepted: true,
    duplicate: false,
    spam: false,
    requestId: String(job.id),
    leadNodeKey: leadNode.nodeKey,
    confirmation: introRequestConfirmationText(parsed.value),
  };
}

function toIntroRequestRecord(row: {
  id: number;
  payload: Record<string, unknown> | null;
  createdAt: Date | null;
}): AiInfluenzaIntroRequestRecord {
  const payload = row.payload ?? {};
  const request = (payload.request && typeof payload.request === "object" ? payload.request : {}) as Record<string, unknown>;
  const packageId = typeof request.packageId === "string" ? request.packageId : "unsure";
  const preferredWindow = typeof request.preferredWindow === "string" ? request.preferredWindow : "flexibel";
  const safePackageId = (packageId in AI_INFLUENZA_INTRO_PACKAGE_LABELS ? packageId : "unsure") as AiInfluenzaIntroPackageChoice;
  const safeWindow = (preferredWindow in AI_INFLUENZA_INTRO_WINDOW_LABELS ? preferredWindow : "flexibel") as AiInfluenzaIntroWindow;

  return {
    id: String(row.id),
    receivedAt: typeof payload.receivedAt === "string" ? payload.receivedAt : row.createdAt?.toISOString() ?? null,
    handled: payload.handled === true,
    handledAt: typeof payload.handledAt === "string" ? payload.handledAt : null,
    name: typeof request.name === "string" ? request.name : "",
    email: typeof request.email === "string" ? request.email : "",
    company: typeof request.company === "string" ? request.company : "",
    domain: typeof request.domain === "string" ? request.domain : "",
    packageId: safePackageId,
    packageLabel: AI_INFLUENZA_INTRO_PACKAGE_LABELS[safePackageId],
    preferredWindow: safeWindow,
    preferredWindowLabel: AI_INFLUENZA_INTRO_WINDOW_LABELS[safeWindow],
    goal: typeof request.goal === "string" ? request.goal : "",
    leadNodeKey: typeof payload.leadNodeKey === "string" ? payload.leadNodeKey : null,
    leadScore: typeof payload.leadScore === "number" ? payload.leadScore : null,
    leadTier: typeof payload.leadTier === "string" ? payload.leadTier : null,
  };
}

/** Admin-Ansicht: Anfragen plus Kennzahlen, neueste zuerst. */
export async function listAiInfluenzaIntroRequests(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");
  const rows = await db
    .select()
    .from(revenueJobs)
    .where(eq(revenueJobs.kind, AI_INFLUENZA_INTRO_JOB_KIND))
    .orderBy(desc(revenueJobs.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
  const requests = rows.map((row) => toIntroRequestRecord(row));
  return { requests, summary: summarizeIntroRequests(requests) };
}

/** Markiert eine Anfrage als erledigt. Der Kontakt selbst bleibt Sache des Menschen. */
export async function markAiInfluenzaIntroRequestHandled(input: { requestId: string; handled: boolean; actorOpenId: string; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");
  const id = Number(input.requestId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Ungueltige Anfrage-ID.");
  const [row] = await db.select().from(revenueJobs).where(eq(revenueJobs.id, id)).limit(1);
  if (!row || row.kind !== AI_INFLUENZA_INTRO_JOB_KIND) throw new Error("Anfrage nicht gefunden.");
  const handledAt = input.handled ? (input.now ?? new Date()).toISOString() : null;
  const payload = {
    ...(row.payload ?? {}),
    handled: input.handled,
    handledAt,
    handledByOpenId: input.handled ? input.actorOpenId : null,
  };
  await db.update(revenueJobs).set({ payload, updatedAt: new Date() }).where(eq(revenueJobs.id, id));
  return { requestId: String(id), handled: input.handled, handledAt };
}

/** Nur fuer Tests und Diagnose: Knoten einer Anfrage direkt lesen. */
export async function aiInfluenzaIntroLeadNode(nodeKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");
  const [row] = await db.select().from(b2bNetworkNodes).where(eq(b2bNetworkNodes.nodeKey, nodeKey)).limit(1);
  return row ?? null;
}

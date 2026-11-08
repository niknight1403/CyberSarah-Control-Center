/**
 * Hub-Draft-Autopilot: fuellt die Entwurfs-Queue so, dass jeder Hub alle vier
 * Loop-Stufen besitzt, und legt je Hub einen Loop-Engineering-Entwurf an.
 *
 * Was dieser Lauf bewusst NICHT tut: veroeffentlichen, versenden, Preise
 * setzen. Er erzeugt ausschliesslich `pending`-Entwuerfe. Verteilung bleibt
 * hinter der bestehenden Freigabe (draft-engine-router / publishing-review).
 * Damit ist der Loop autonom im Denken und kontrolliert im Handeln.
 *
 * Wahrheitsregel: Reichweiten- und Umsatzaussagen entstehen nicht hier. Die
 * Entwuerfe benennen Metrik und Messluecke, keine erfundenen Zahlen.
 */
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./db";
import { draftQueue } from "../drizzle/schema";
import {
  buildCoverage,
  buildHubContentDraft,
  buildHubLoopDraft,
  countCoverage,
  DRAFT_HUB_IDS,
  getHubDefinition,
  planHubDrafts,
  type CoverageSummary,
  type DraftHubId,
  type HubDraftJob,
} from "../lib/hub-draft-coverage-logic";
import {
  DRAFT_MAX_PENDING_BY_KIND,
  validateDraftPayload,
  type ContentDraftPayload,
  type DraftPayloadByKind,
  type RevenueLoopDraftPayload,
} from "../lib/draft-engine-logic";

export type HubDraftRow = { kind: string; payload: unknown; status: string };

export type HubDraftDeps = {
  listOpenDrafts?: () => Promise<HubDraftRow[]>;
  insertDraft?: (
    kind: "content" | "revenue-loop",
    title: string,
    payload: DraftPayloadByKind["content"] | DraftPayloadByKind["revenue-loop"],
    dedupeKey: string,
  ) => Promise<"inserted" | "duplicate">;
  now?: () => number;
  hubs?: readonly DraftHubId[];
  /** Vorschau: nichts schreiben, nur melden, was angelegt wuerde. */
  dryRun?: boolean;
};

export type HubDraftJobResult = {
  hub: DraftHubId;
  stage: string;
  personaId: string;
  platform: string;
  dedupeKey: string;
  outcome: "created" | "duplicate" | "skipped" | "planned";
  reason?: string;
};

export type HubDraftRunResult = {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  planned: number;
  created: number;
  duplicates: number;
  skipped: { hub: string; stage: string; reason: string }[];
  loopDrafts: { planned: number; created: number; duplicates: number };
  jobs: HubDraftJobResult[];
  coverage: CoverageSummary;
  note: string;
};

async function defaultListOpenDrafts(): Promise<HubDraftRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload, status: draftQueue.status })
    .from(draftQueue)
    .where(eq(draftQueue.status, "pending"))
    .orderBy(desc(draftQueue.createdAt))
    .limit(500);
  return rows.map((row) => ({ kind: row.kind, payload: row.payload, status: row.status }));
}

async function defaultInsertDraft(
  kind: "content" | "revenue-loop",
  title: string,
  payload: DraftPayloadByKind["content"] | DraftPayloadByKind["revenue-loop"],
  dedupeKey: string,
): Promise<"inserted" | "duplicate"> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Entwurf nicht speicherbar.");
  const inserted = await db
    .insert(draftQueue)
    .values({ kind, title, payload, status: "pending", createdBy: "hub-draft-autopilot", dedupeKey })
    .onConflictDoNothing({ target: draftQueue.dedupeKey })
    .returning({ id: draftQueue.id });
  return inserted.length > 0 ? "inserted" : "duplicate";
}

/** Zaehlt offene Inhalts-Entwuerfe unabhaengig von der Hub-Zuordnung. */
function countPendingContent(rows: readonly HubDraftRow[]): number {
  return rows.filter((row) => row.kind === "content" && row.status === "pending").length;
}

function loopDedupeKey(hub: DraftHubId, periodKey: string): string {
  return `hub-loop:${hub}:${periodKey}`;
}

/**
 * Ein Lauf: Soll gegen Ist rechnen, fehlende Stufen anlegen, je Hub einen
 * Loop-Entwurf sicherstellen.
 */
export async function runHubDraftAutopilot(deps: HubDraftDeps = {}): Promise<HubDraftRunResult> {
  const now = deps.now ?? Date.now;
  const nowMs = now();
  const startedAt = new Date(nowMs).toISOString();
  const listOpenDrafts = deps.listOpenDrafts ?? defaultListOpenDrafts;
  const write = !deps.dryRun;
  const insertDraft = deps.insertDraft ?? defaultInsertDraft;

  const openDrafts = await listOpenDrafts();
  const covered = countCoverage(openDrafts);
  const jobs = planHubDrafts({ nowMs, covered, hubs: deps.hubs });

  const pendingContent = countPendingContent(openDrafts);
  const contentLimit = DRAFT_MAX_PENDING_BY_KIND.content;
  const contentSlots = Math.max(0, contentLimit - pendingContent);

  const results: HubDraftJobResult[] = [];
  const skipped: HubDraftRunResult["skipped"] = [];
  let created = 0;
  let duplicates = 0;
  const simulatedRows: HubDraftRow[] = [...openDrafts];

  for (const job of jobs) {
    if (results.filter((entry) => entry.outcome === "created").length >= contentSlots) {
      skipped.push({ hub: job.hub, stage: job.stage, reason: `Queue-Limit fuer Inhalte erreicht (${contentLimit})` });
      results.push({ ...jobResult(job), outcome: "skipped", reason: "content-limit" });
      continue;
    }

    const draft = buildHubContentDraft(job);
    const validated = validateDraftPayload("content", {
      personaId: draft.personaId,
      platform: draft.platform,
      topic: draft.topic,
      content: draft.content,
      disclosure: draft.disclosure,
      hub: draft.hub,
      loopStage: draft.loopStage,
    } satisfies ContentDraftPayload);
    if (!validated.valid) {
      skipped.push({ hub: job.hub, stage: job.stage, reason: validated.reason });
      results.push({ ...jobResult(job), outcome: "skipped", reason: validated.reason });
      continue;
    }

    const writeOutcome = write
      ? await insertDraft("content", validated.title, validated.payload as ContentDraftPayload, job.dedupeKey)
      : ("planned" as const);
    const outcome: HubDraftJobResult["outcome"] = writeOutcome === "inserted" ? "created" : writeOutcome;
    results.push({ ...jobResult(job), outcome });
    if (writeOutcome === "planned") {
      simulatedRows.push({ kind: "content", status: "pending", payload: validated.payload });
    } else if (writeOutcome === "inserted") {
      created += 1;
      simulatedRows.push({ kind: "content", status: "pending", payload: validated.payload });
    } else {
      duplicates += 1;
      // Ein Duplikat bedeutet: diese Stufe ist bereits besetzt.
      simulatedRows.push({ kind: "content", status: "pending", payload: validated.payload });
    }
  }

  // Loop-Engineering je Hub: ein Entwurf pro Revenue-Hub und Monat.
  const periodKey = startedAt.slice(0, 7); // YYYY-MM
  const existingLoopHubs = new Set(
    openDrafts
      .filter((row) => row.kind === "revenue-loop" && row.status === "pending")
      .map((row) => (row.payload as { autopilotKey?: unknown })?.autopilotKey)
      .filter((key): key is string => typeof key === "string"),
  );

  let loopPlanned = 0;
  let loopCreated = 0;
  let loopDuplicates = 0;
  const loopLimit = Math.max(0, DRAFT_MAX_PENDING_BY_KIND["revenue-loop"] - existingLoopHubs.size);
  const loopHubs = new Set(
    (deps.hubs ?? DRAFT_HUB_IDS).map((hubId) => getHubDefinition(hubId)?.revenueHub).filter(Boolean),
  );

  for (const revenueHub of loopHubs) {
    const sourceHub = (deps.hubs ?? DRAFT_HUB_IDS).find(
      (hubId) => getHubDefinition(hubId)?.revenueHub === revenueHub,
    );
    if (!sourceHub) continue;
    const loop = buildHubLoopDraft(sourceHub);
    if (existingLoopHubs.has(loop.autopilotKey)) continue;
    if (loopPlanned >= loopLimit) break;
    loopPlanned += 1;

    const validated = validateDraftPayload("revenue-loop", {
      hub: loop.hub,
      name: loop.name,
      hypothesis: loop.hypothesis,
      stages: loop.stages,
      metric: loop.metric,
      experiment: loop.experiment,
      baseline: loop.baseline,
      target: loop.target,
      autopilotKey: loop.autopilotKey,
    } satisfies RevenueLoopDraftPayload);
    if (!validated.valid) {
      skipped.push({ hub: sourceHub, stage: "loop", reason: validated.reason });
      continue;
    }
    const loopOutcome = write
      ? await insertDraft("revenue-loop", validated.title, validated.payload as RevenueLoopDraftPayload, loopDedupeKey(sourceHub, periodKey))
      : ("planned" as const);
    if (loopOutcome === "planned") {
      simulatedRows.push({ kind: "revenue-loop", status: "pending", payload: validated.payload });
    } else if (loopOutcome === "inserted") {
      loopCreated += 1;
      simulatedRows.push({ kind: "revenue-loop", status: "pending", payload: validated.payload });
    } else {
      loopDuplicates += 1;
    }
  }

  const coverage = buildCoverage(simulatedRows, deps.hubs ?? DRAFT_HUB_IDS);

  return {
    ok: true,
    dryRun: !write,
    startedAt,
    planned: jobs.length,
    created,
    duplicates,
    skipped,
    loopDrafts: { planned: loopPlanned, created: loopCreated, duplicates: loopDuplicates },
    jobs: results,
    coverage,
    note: "Nur pending-Entwuerfe erzeugt. Veroeffentlichung erfolgt ausschliesslich nach menschlicher Freigabe.",
  };
}

function jobResult(job: HubDraftJob): Omit<HubDraftJobResult, "outcome"> {
  return {
    hub: job.hub,
    stage: job.stage,
    personaId: job.personaId,
    platform: job.platform,
    dedupeKey: job.dedupeKey,
  };
}

/** Vorschau ohne Schreibzugriff: was wuerde der naechste Lauf anlegen? */
export async function previewHubDraftAutopilot(deps: Omit<HubDraftDeps, "insertDraft"> = {}): Promise<{
  jobs: (HubDraftJob & { title: string })[];
  loopDrafts: { sourceHub: DraftHubId; title: string }[];
  coverage: CoverageSummary;
}> {
  const nowMs = (deps.now ?? Date.now)();
  const openDrafts = await (deps.listOpenDrafts ?? defaultListOpenDrafts)();
  const jobs = planHubDrafts({ nowMs, covered: countCoverage(openDrafts), hubs: deps.hubs });
  const loopDrafts = (deps.hubs ?? DRAFT_HUB_IDS).flatMap((hubId) => {
    const loop = buildHubLoopDraft(hubId);
    return [{ sourceHub: hubId, title: loop.title }];
  });
  return {
    jobs: jobs.map((job) => ({ ...job, title: buildHubContentDraft(job).title })),
    loopDrafts,
    coverage: buildCoverage(openDrafts, deps.hubs ?? DRAFT_HUB_IDS),
  };
}

/** Bequemer Zugriff fuer den Autopilot-Loop: nur Inhalte, keine Doppelten. */
export async function pendingHubDrafts(limit = 50): Promise<HubDraftRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload, status: draftQueue.status })
    .from(draftQueue)
    .where(and(eq(draftQueue.status, "pending"), eq(draftQueue.kind, "content")))
    .orderBy(desc(draftQueue.createdAt))
    .limit(limit);
  return rows.map((row) => ({ kind: row.kind, payload: row.payload, status: row.status }));
}

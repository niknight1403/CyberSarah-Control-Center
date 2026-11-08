/**
 * Discovery-Lauf: sammelt echte Signale aus der eigenen Datenbasis, bewertet
 * sie und legt fuer die lohnendsten Kandidaten einen Ideen-Entwurf an.
 *
 * Warum nur interne Quellen: ein "Agent, der im Netz nach Umsatz sucht" ohne
 * belegte Daten produziert Behauptungen. Alles hier ist nachpruefbar —
 * Produktscores, Angebotsstatus, Loop-Abdeckung, Integrations-Readiness.
 * Marktplatz- und Partnersignale sind vorbereitet, aber als `assisted`
 * markiert: sie brauchen eine echte API-Antwort, bevor sie zaehlen.
 */
import { and, desc, eq, like, sql } from "drizzle-orm";

import { getDb } from "./db";
import { affiliateProducts, draftQueue, revenueOffers } from "../drizzle/schema";
import {
  automatableCandidates,
  planDiscoveryRun,
  buildOpportunityDraft,
  type OpportunityCandidate,
  type OpportunitySignals,
  type ScoredCandidate,
  type DiscoveryPlan,
} from "../lib/revenue-discovery-logic";
import {
  DRAFT_HUB_IDS,
  LOOP_STAGES,
  readDraftTags,
  type DraftHubId,
  type LoopStage,
} from "../lib/hub-draft-coverage-logic";
import { getAllIntegrationStatuses } from "../lib/integration-registry-logic";
import { validateDraftPayload } from "../lib/draft-engine-logic";

export type DiscoveryDeps = {
  listAffiliateProducts?: () => Promise<{ slug: string; title: string; score: number | null; commissionPercent: number | null; platform: string }[]>;
  listOffers?: () => Promise<{ name: string; kind: string; status: string }[]>;
  listDraftRows?: () => Promise<{ kind: string; payload: unknown; status: string }[]>;
  listExistingDiscoveryKeys?: () => Promise<string[]>;
  integrationStatuses?: () => { key: string; label: string; readiness: string; missingEnv: string[] }[];
  insertDraft?: (title: string, payload: { note: string; rationale: string }, dedupeKey: string) => Promise<"inserted" | "duplicate">;
  now?: () => number;
  /** Trockenlauf: bewerten, aber nichts schreiben. */
  dryRunWrite?: boolean;
};

export type DiscoveryRunResult = {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  periodKey: string;
  evaluated: number;
  integrate: number;
  test: number;
  review: number;
  skip: number;
  created: number;
  duplicates: number;
  drafts: { title: string; score: number; verdict: string; dedupeKey: string; hub: DraftHubId }[];
  top: ScoredCandidate[];
  skipped: { subject: string; reason: string }[];
  note: string;
};

async function defaultAffiliateProducts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      slug: affiliateProducts.slug,
      title: affiliateProducts.title,
      score: affiliateProducts.score,
      commissionPercent: affiliateProducts.commissionPercent,
      platform: affiliateProducts.platform,
    })
    .from(affiliateProducts)
    .orderBy(desc(affiliateProducts.score))
    .limit(40);
  return rows.map((row) => ({ ...row, platform: row.platform ?? "unbekannt" }));
}

async function defaultOffers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ name: revenueOffers.name, kind: revenueOffers.kind, status: revenueOffers.status })
    .from(revenueOffers)
    .limit(200);
}

async function defaultDraftRows() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload, status: draftQueue.status })
    .from(draftQueue)
    .orderBy(desc(draftQueue.createdAt))
    .limit(400);
  return rows.map((row) => ({ kind: row.kind as string, payload: row.payload, status: row.status as string }));
}

async function defaultExistingDiscoveryKeys(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ dedupeKey: draftQueue.dedupeKey })
    .from(draftQueue)
    .where(like(draftQueue.dedupeKey, "discovery:%"))
    .limit(500);
  return rows.flatMap((row) => (row.dedupeKey ? [row.dedupeKey] : []));
}

/** Integrationen, deren Ausfall direkt Umsatz kostet, mit Hub-Zuordnung. */
const INTEGRATION_HUB_MAP: { match: RegExp; hub: DraftHubId; path: string }[] = [
  { match: /stripe|digistore|payment|checkout/i, hub: "loop", path: "Bezahlweg im Funnel freischalten" },
  { match: /resend|email|smtp|mail/i, hub: "hara", path: "Programm-/Angebots-Mails zustellbar machen" },
  { match: /tiktok|meta|instagram|publish/i, hub: "reach", path: "Verteilung in den Kanal bringen" },
];

function signalsFor(partial: Partial<OpportunitySignals>): OpportunitySignals {
  return {
    demand: partial.demand ?? 0,
    fit: partial.fit ?? 0,
    margin: partial.margin ?? 0,
    ease: partial.ease ?? 50,
    safety: partial.safety ?? 80,
  };
}

const HUB_LABELS: Record<DraftHubId, string> = {
  hara: "HARA Coaching & Programme",
  saas: "SaaS & Tools",
  loop: "Loop-Engineering & Funnels",
  trading: "Finanzbildung & Marktlesen",
  reach: "Reichweite & Short-Form",
  faceless: "Faceless Channels",
  b2b: "B2B-Netzwerk & Partnerschaften",
  affiliate: "Affiliate & Produktkatalog",
};

/**
 * Baut Kandidaten aus den vorhandenen Signalen. Jede Regel nennt ihren Beleg;
 * fehlt er, senkt das die Einstufung statt sie zu erfinden.
 */
export function deriveCandidates(input: {
  products: { slug: string; title: string; score: number | null; commissionPercent: number | null; platform: string }[];
  offers: { name: string; kind: string; status: string }[];
  draftRows: { kind: string; payload: unknown; status: string }[];
  integrations: { key: string; label: string; readiness: string; missingEnv: string[] }[];
}): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = [];

  // 1. Affiliate-Produkte mit Signal, die noch nicht im Loop sind.
  for (const product of input.products.slice(0, 12)) {
    const hasDraft = input.draftRows.some((row) =>
      JSON.stringify(row.payload ?? {}).toLowerCase().includes(product.slug.toLowerCase()),
    );
    if (hasDraft) continue;
    const evidenceComplete = product.score !== null && product.commissionPercent !== null;
    candidates.push({
      source: "affiliate-catalog",
      hub: "affiliate",
      subject: product.slug,
      title: `Affiliate-Kandidat: ${product.title.slice(0, 80)}`,
      revenuePath: `Provision ueber ${product.platform} — Empfehlung im Affiliate-Hub und in passenden Content-Loops`,
      integrationStep: "Produkt im Affiliate-Hub einer Persona zuordnen und eine Empfehlungsstufe (Angebot) einplanen",
      signals: signalsFor({
        demand: product.score ?? 0,
        fit: 65,
        margin: product.commissionPercent === null ? 0 : Math.min(100, product.commissionPercent * 2),
        ease: 70,
        safety: 75,
      }),
      evidenceComplete,
      evidenceNotes: [
        product.score !== null ? `Score ${product.score}` : "kein Score",
        product.commissionPercent !== null ? `Provision ${product.commissionPercent}%` : "keine Provision bekannt",
      ],
    });
  }

  // 2. Bereiche mit Inhalt, aber ohne aktives Angebot.
  const activeOfferKinds = new Set(
    input.offers.filter((offer) => offer.status === "active").map((offer) => offer.kind.toLowerCase()),
  );
  const hubsWithContent = new Map<DraftHubId, number>();
  for (const row of input.draftRows) {
    if (row.status !== "pending") continue;
    const tags = readDraftTags(row);
    if (!tags.hub) continue;
    hubsWithContent.set(tags.hub, (hubsWithContent.get(tags.hub) ?? 0) + 1);
  }
  for (const hub of DRAFT_HUB_IDS) {
    const openDrafts = hubsWithContent.get(hub) ?? 0;
    if (openDrafts === 0) continue;
    if (activeOfferKinds.has(hub) || activeOfferKinds.has(hub === "hara" ? "coaching" : hub)) continue;
    candidates.push({
      source: "offer-gap",
      hub,
      subject: `angebot-${hub}`,
      title: `Angebotsluecke: ${HUB_LABELS[hub]}`,
      revenuePath: `Reichweite im Bereich ${HUB_LABELS[hub]} laeuft, aber es gibt kein aktives Angebot als Gegenstueck`,
      integrationStep: `Angebot fuer ${HUB_LABELS[hub]} in revenue_offers als Entwurf anlegen (Preis und Umfang festlegen)`,
      signals: signalsFor({ demand: 55, fit: 70, margin: 0, ease: 60, safety: 85 }),
      // Der fehlende Preis ist der Beleg dafuer, dass hier noch entschieden
      // werden muss — deshalb kein "integrierbar".
      evidenceComplete: false,
      evidenceNotes: [`${openDrafts} offene Entwuerfe im Bereich`, "kein aktives Angebot"],
    });
  }

  // 3. Bereiche ohne Loop-Entwurf.
  const loopHubs = new Set(
    input.draftRows.flatMap((row) => {
      if (row.kind !== "revenue-loop") return [];
      const payload = (row.payload ?? {}) as { autopilotKey?: unknown; hub?: unknown };
      return typeof payload.autopilotKey === "string" ? [String(payload.hub ?? "")] : [];
    }),
  );
  for (const hub of DRAFT_HUB_IDS) {
    if (loopHubs.has(hub)) continue;
    if (!(hubsWithContent.get(hub) ?? 0)) continue;
    candidates.push({
      source: "loop-gap",
      hub,
      subject: `loop-${hub}`,
      title: `Fehlender Umsatz-Loop: ${HUB_LABELS[hub]}`,
      revenuePath: `Loop-Engineering fuer ${HUB_LABELS[hub]} — Aufmerksamkeit in Wiederverwendung und Angebot ueberfuehren`,
      integrationStep: "Loop-Entwurf im Hub anlegen und die vier Stufen mit Messpunkten versehen",
      signals: signalsFor({ demand: 50, fit: 75, margin: 0, ease: 65, safety: 90 }),
      evidenceComplete: true,
      evidenceNotes: ["Bereich produziert Inhalte", "kein Loop-Entwurf vorhanden"],
    });
  }

  // 4. Rote Integrationen, die direkt Umsatz kosten.
  for (const integration of input.integrations) {
    if (integration.readiness === "ready") continue;
    const mapping = INTEGRATION_HUB_MAP.find((entry) => entry.match.test(integration.key) || entry.match.test(integration.label));
    if (!mapping) continue;
    candidates.push({
      source: "integration-gap",
      hub: mapping.hub,
      subject: `integration-${integration.key}`,
      title: `Rote Integration: ${integration.label}`,
      revenuePath: `${mapping.path} — ohne diese Verbindung bleibt der Umsatzweg unterbrochen`,
      integrationStep:
        integration.missingEnv.length > 0
          ? `Fehlende Konfiguration setzen: ${integration.missingEnv.join(", ")}`
          : "Integration im Dashboard pruefen und Verbindung erneuern",
      signals: signalsFor({ demand: 70, fit: 80, margin: 0, ease: 55, safety: 85 }),
      evidenceComplete: true,
      evidenceNotes: [
        `Readiness: ${integration.readiness}`,
        integration.missingEnv.length > 0 ? `fehlend: ${integration.missingEnv.join(", ")}` : "Zugangsdaten vorhanden, Verbindung fehlerhaft",
      ],
    });
  }

  return candidates;
}

async function defaultInsertDraft(
  title: string,
  payload: { note: string; rationale: string },
  dedupeKey: string,
): Promise<"inserted" | "duplicate"> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Discovery-Entwurf nicht speicherbar.");
  const inserted = await db
    .insert(draftQueue)
    .values({ kind: "idea", title, payload, status: "pending", createdBy: "revenue-discovery", dedupeKey })
    .onConflictDoNothing({ target: draftQueue.dedupeKey })
    .returning({ id: draftQueue.id });
  return inserted.length > 0 ? "inserted" : "duplicate";
}

/** Ein Discovery-Lauf: Signale sammeln, bewerten, Entwuerfe anlegen. */
export async function runRevenueDiscovery(deps: DiscoveryDeps = {}): Promise<DiscoveryRunResult> {
  const nowMs = (deps.now ?? Date.now)();
  const startedAt = new Date(nowMs).toISOString();
  const dryRun = deps.dryRunWrite === true ? true : false;

  const [products, offers, draftRows, existingKeys] = await Promise.all([
    (deps.listAffiliateProducts ?? defaultAffiliateProducts)(),
    (deps.listOffers ?? defaultOffers)(),
    (deps.listDraftRows ?? defaultDraftRows)(),
    (deps.listExistingDiscoveryKeys ?? defaultExistingDiscoveryKeys)(),
  ]);
  const integrations = (deps.integrationStatuses ?? getAllIntegrationStatuses)();

  const candidates = automatableCandidates(
    deriveCandidates({
      products,
      offers,
      draftRows,
      integrations: integrations.map((status) => ({
        key: status.key,
        label: status.label,
        readiness: status.readiness,
        missingEnv: status.missingEnv,
      })),
    }),
  );

  const plan: DiscoveryPlan = planDiscoveryRun(candidates, {
    nowMs,
    maxDrafts: 4,
    alreadyDrafted: existingKeys,
  });

  const insertDraft = deps.insertDraft ?? defaultInsertDraft;
  const drafts: DiscoveryRunResult["drafts"] = [];
  const skipped: DiscoveryRunResult["skipped"] = [];
  let created = 0;
  let duplicates = 0;

  for (const candidate of plan.toDraft) {
    const draft = buildOpportunityDraft(candidate);
    const validated = validateDraftPayload("idea", draft.payload);
    if (!validated.valid) {
      skipped.push({ subject: candidate.subject, reason: validated.reason });
      continue;
    }
    if (dryRun) {
      drafts.push({ title: draft.title, score: candidate.score, verdict: candidate.verdict, dedupeKey: candidate.dedupeKey, hub: candidate.hub });
      continue;
    }
    const outcome = await insertDraft(draft.title, validated.payload as { note: string; rationale: string }, candidate.dedupeKey);
    drafts.push({ title: draft.title, score: candidate.score, verdict: candidate.verdict, dedupeKey: candidate.dedupeKey, hub: candidate.hub });
    if (outcome === "inserted") created += 1;
    else duplicates += 1;
  }

  return {
    ok: true,
    dryRun,
    startedAt,
    periodKey: plan.periodKey,
    evaluated: candidates.length,
    integrate: plan.integrate.length,
    test: plan.test.length,
    review: plan.review.length,
    skip: plan.skip.length,
    created,
    duplicates,
    drafts,
    top: [...plan.integrate, ...plan.test].slice(0, 5),
    skipped,
    note: dryRun
      ? "Trockenlauf: nichts geschrieben, nur Bewertung."
      : "Ideen-Entwuerfe angelegt. Produkte, Preise und Kampagnen bleiben Freigabe-Sache.",
  };
}

/** Nur Bewertung, ohne Schreibzugriff — fuer die UI. */
export async function previewRevenueDiscovery(deps: DiscoveryDeps = {}): Promise<{
  plan: DiscoveryPlan;
  sources: number;
}> {
  const nowMs = (deps.now ?? Date.now)();
  const [products, offers, draftRows, existingKeys] = await Promise.all([
    (deps.listAffiliateProducts ?? defaultAffiliateProducts)(),
    (deps.listOffers ?? defaultOffers)(),
    (deps.listDraftRows ?? defaultDraftRows)(),
    (deps.listExistingDiscoveryKeys ?? defaultExistingDiscoveryKeys)(),
  ]);
  const integrations = (deps.integrationStatuses ?? getAllIntegrationStatuses)();
  const candidates = automatableCandidates(
    deriveCandidates({
      products,
      offers,
      draftRows,
      integrations: integrations.map((status) => ({
        key: status.key,
        label: status.label,
        readiness: status.readiness,
        missingEnv: status.missingEnv,
      })),
    }),
  );
  return {
    plan: planDiscoveryRun(candidates, { nowMs, maxDrafts: 4, alreadyDrafted: existingKeys }),
    sources: candidates.length,
  };
}

/** Fuer den Autopilot: zaehlt offene Discovery-Entwuerfe (Idempotenz-Check). */
export async function countOpenDiscoveryDrafts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(draftQueue)
    .where(and(eq(draftQueue.status, "pending"), like(draftQueue.dedupeKey, "discovery:%")));
  return rows[0]?.count ?? 0;
}

/** Bereiche, die laut Abdeckung noch eine Stufe brauchen (fuer Signale). */
export function uncoveredStages(rows: { kind: string; payload: unknown; status: string }[], hub: DraftHubId): LoopStage[] {
  const covered = new Set(
    rows.flatMap((row) => {
      const tags = readDraftTags(row);
      return tags.hub === hub && tags.stage ? [tags.stage] : [];
    }),
  );
  return LOOP_STAGES.filter((stage) => !covered.has(stage));
}

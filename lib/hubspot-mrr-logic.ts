/**
 * MRR-Kennzahlen aus HubSpot-Deals, ohne Netzzugriff und damit testbar.
 *
 * Regel: Ein Deal zaehlt als wiederkehrender Umsatz, wenn er in einer als
 * "geschlossen/gewonnen" markierten Stage steht. Der Betrag wird auf einen
 * Monat normalisiert, sofern der Deal ein Abrechnungsintervall traegt; fehlt
 * es, gilt der Betrag als monatlich. Diese Annahme steht im Ergebnis, statt
 * stillschweigend zu passieren.
 */

export interface HubspotMrrDeal {
  id: string;
  properties?: Record<string, unknown>;
}

export interface HubspotMrrPipelineStage {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface HubspotMrrPipeline {
  id: string;
  label?: string;
  stages?: HubspotMrrPipelineStage[];
}

export interface HubspotMrrOwner {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface HubspotOwnerShare {
  ownerId: string;
  ownerName: string;
  mrr: number;
  dealCount: number;
}

export interface HubspotStageShare {
  stageId: string;
  label: string;
  won: boolean;
  value: number;
  dealCount: number;
}

export interface HubspotMrrTrendBucket {
  month: string;
  wonValue: number;
  dealCount: number;
}

export interface HubspotMrrSnapshot {
  currency: string;
  mrr: number;
  mrrDeals: number;
  newMrrWindow: number;
  newMrrDeals: number;
  openPipelineValue: number;
  openDeals: number;
  weightedPipelineValue: number;
  byOwner: HubspotOwnerShare[];
  byStage: HubspotStageShare[];
  trend: HubspotMrrTrendBucket[];
  coverage: {
    dealsRead: number;
    wonDeals: number;
    withoutAmount: number;
    withoutOwner: number;
    withoutCloseDate: number;
    unknownStage: number;
  };
  assumptions: string[];
  windowDays: number;
  fetchedAt: string;
}

const MONTHLY_FACTORS: Record<string, number> = {
  monthly: 1,
  monthly_recurring: 1,
  monatlich: 1,
  quarterly: 1 / 3,
  quartalsweise: 1 / 3,
  annually: 1 / 12,
  annual: 1 / 12,
  yearly: 1 / 12,
  jaehrlich: 1 / 12,
  jährlich: 1 / 12,
  weekly: 52 / 12,
  woechentlich: 52 / 12,
  wöchentlich: 52 / 12,
};

const INTERVAL_PROPERTIES = ["billing_frequency", "billingfrequency", "abrechnungsintervall", "recurrence"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function numeric(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number.parseFloat(text(value).replace(",", "."));
  return Number.isFinite(raw) ? raw : null;
}

/** Nur echte Schliess-Stages zaehlen als gewonnen (isClosed + probability 1). */
export function resolveWonStageIds(pipelines: HubspotMrrPipeline[]): Set<string> {
  const won = new Set<string>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages ?? []) {
      const closed = text(stage.metadata?.isClosed).toLowerCase() === "true" || stage.metadata?.isClosed === true;
      const probability = numeric(stage.metadata?.probability);
      if (closed && (probability === null || probability >= 1)) won.add(stage.id);
    }
  }
  return won;
}

/** Faktor, der einen Dealbetrag auf einen Monat umrechnet. */
export function monthlyFactor(properties: Record<string, unknown> | undefined): number {
  for (const key of INTERVAL_PROPERTIES) {
    const raw = text(properties?.[key]).toLowerCase();
    if (raw && MONTHLY_FACTORS[raw] !== undefined) return MONTHLY_FACTORS[raw];
  }
  return 1;
}

export function ownerDisplayName(owner: HubspotMrrOwner | undefined): string {
  if (!owner) return "Nicht zugewiesen";
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
  return name || owner.email || `Owner ${owner.id}`;
}

function monthKey(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BuildMrrSnapshotInput {
  deals: HubspotMrrDeal[];
  pipelines?: HubspotMrrPipeline[];
  owners?: HubspotMrrOwner[];
  currency?: string;
  windowDays?: number;
  months?: number;
  now?: Date;
}

export function buildHubspotMrrSnapshot(input: BuildMrrSnapshotInput): HubspotMrrSnapshot {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 30;
  const months = input.months ?? 6;
  const pipelines = input.pipelines ?? [];
  const wonStages = resolveWonStageIds(pipelines);
  const ownerById = new Map((input.owners ?? []).map((owner) => [owner.id, owner]));
  const stageLabels = new Map<string, { label: string; won: boolean }>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages ?? []) {
      stageLabels.set(stage.id, { label: stage.label ?? stage.id, won: wonStages.has(stage.id) });
    }
  }

  const windowStart = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const trendBuckets = new Map<string, HubspotMrrTrendBucket>();
  const byOwner = new Map<string, HubspotOwnerShare>();
  const byStage = new Map<string, HubspotStageShare>();

  let mrr = 0;
  let mrrDeals = 0;
  let newMrrWindow = 0;
  let newMrrDeals = 0;
  let openPipelineValue = 0;
  let openDeals = 0;
  let weightedPipelineValue = 0;
  const coverage = {
    dealsRead: input.deals.length,
    wonDeals: 0,
    withoutAmount: 0,
    withoutOwner: 0,
    withoutCloseDate: 0,
    unknownStage: 0,
  };

  for (const deal of input.deals) {
    const props = deal.properties ?? {};
    const stageId = text(props.dealstage);
    const stage = stageLabels.get(stageId);
    const amount = numeric(props.amount);
    const closedate = text(props.closedate);
    const factor = monthlyFactor(props);
    const won = stage?.won === true;

    if (!stageId || !stage) coverage.unknownStage += 1;
    if (amount === null) coverage.withoutAmount += 1;
    const ownerId = text(props.hubspot_owner_id);
    if (!ownerId) coverage.withoutOwner += 1;
    if (!closedate) coverage.withoutCloseDate += 1;

    if (stage) {
      const share = byStage.get(stageId) ?? {
        stageId,
        label: stage.label,
        won,
        value: 0,
        dealCount: 0,
      };
      share.value += amount ?? 0;
      share.dealCount += 1;
      byStage.set(stageId, share);
    }

    if (!won) {
      if (amount !== null) {
        openPipelineValue += amount;
        openDeals += 1;
        const stageProbability = (() => {
          for (const pipeline of pipelines) {
            const match = (pipeline.stages ?? []).find((s) => s.id === stageId);
            if (match) return numeric(match.metadata?.probability) ?? 0;
          }
          return 0;
        })();
        weightedPipelineValue += amount * Math.min(Math.max(stageProbability, 0), 1);
      }
      continue;
    }

    coverage.wonDeals += 1;
    if (amount === null) continue;

    const monthly = amount * factor;
    mrr += monthly;
    mrrDeals += 1;

    const key = ownerId || "";
    const ownerShare = byOwner.get(key) ?? {
      ownerId: key,
      ownerName: ownerDisplayName(ownerById.get(key)),
      mrr: 0,
      dealCount: 0,
    };
    ownerShare.mrr += monthly;
    ownerShare.dealCount += 1;
    byOwner.set(key, ownerShare);

    const closedAt = closedate ? new Date(closedate).getTime() : Number.NaN;
    if (!Number.isNaN(closedAt) && closedAt >= windowStart) {
      newMrrWindow += monthly;
      newMrrDeals += 1;
    }
    const bucketKey = monthKey(closedate);
    if (bucketKey) {
      const bucket = trendBuckets.get(bucketKey) ?? { month: bucketKey, wonValue: 0, dealCount: 0 };
      bucket.wonValue += monthly;
      bucket.dealCount += 1;
      trendBuckets.set(bucketKey, bucket);
    }
  }

  const trend: HubspotMrrTrendBucket[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const pointer = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const key = `${pointer.getUTCFullYear()}-${String(pointer.getUTCMonth() + 1).padStart(2, "0")}`;
    trend.push(trendBuckets.get(key) ?? { month: key, wonValue: 0, dealCount: 0 });
  }

  const assumptions: string[] = [];
  const withoutInterval = input.deals.filter(
    (deal) => {
      const props = deal.properties ?? {};
      const stageId = text(props.dealstage);
      return stageLabels.get(stageId)?.won === true && INTERVAL_PROPERTIES.every((key) => !text(props[key]));
    },
  ).length;
  if (withoutInterval > 0) assumptions.push("Ohne Abrechnungsintervall gilt der Dealbetrag als monatlich.");
  if (coverage.withoutAmount > 0) assumptions.push("Deals ohne Betrag zaehlen nicht in den Summen.");
  if ((input.pipelines ?? []).length === 0) assumptions.push("Ohne Pipeline-Metadaten ist keine Won-Stage bekannt.");
  if ((input.owners ?? []).length === 0) assumptions.push("Ohne Owner-Daten bleiben Zuweisungen bei 'Nicht zugewiesen'.");

  return {
    currency: input.currency ?? "EUR",
    mrr: round2(mrr),
    mrrDeals,
    newMrrWindow: round2(newMrrWindow),
    newMrrDeals,
    openPipelineValue: round2(openPipelineValue),
    openDeals,
    weightedPipelineValue: round2(weightedPipelineValue),
    byOwner: [...byOwner.values()].sort((a, b) => b.mrr - a.mrr).map((entry) => ({ ...entry, mrr: round2(entry.mrr) })),
    byStage: [...byStage.values()].sort((a, b) => Number(b.won) - Number(a.won) || b.value - a.value).map((entry) => ({ ...entry, value: round2(entry.value) })),
    trend,
    coverage,
    assumptions,
    windowDays,
    fetchedAt: now.toISOString(),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

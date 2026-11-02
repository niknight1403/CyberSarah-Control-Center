/**
 * Revenue-Loop-Orchestrator (reine Logik, ohne I/O).
 *
 * Führt die vorhandenen Bausteine zu EINEM geschlossenen Regelkreis zusammen:
 *   messen (Umsatz, Reichweite, B2B-Netzwerk)
 *   → priorisieren (größter Hebel aus buildRevenueOpportunities)
 *   → handeln (begrenzte, freigabepflichtige Aktionen je Bereich)
 *   → bewerten (Veränderung gegen Baseline, Urteil scale/iterate/stop)
 *   → lernen (Signale an nextLoopDirective, das Endlosschleifen erkennt).
 *
 * Grundsätze:
 * - Keine erfundenen Zahlen: fehlt eine Baseline, bleibt der Wert null und
 *   das Urteil lautet "nicht messbar" statt einer geschätzten Verbesserung.
 * - Externe Wirkung (Ansprache von Menschen, Zahlungen) ist immer als
 *   freigabepflichtig markiert und wird hier nie ausgelöst.
 * - Deterministisch: gleiche Eingabe → gleiche Reihenfolge und gleiches Urteil.
 */
import {
  buildRevenueOpportunities,
  revenueAutopilotStatus,
  DEFAULT_REVENUE_AUTOPILOT_TARGETS,
  type RevenueAutopilotSnapshot,
  type RevenueAutopilotTargets,
  type RevenueOpportunity,
} from "./revenue-autopilot-logic";
import { nextLoopDirective, type GoalRunSignals, type LoopDirective } from "./loop-engineering-logic";

export type ReachInput = {
  impressions?: number | null;
  visits?: number | null;
  signups?: number | null;
  activations?: number | null;
};

export type ReachStage = "impressions" | "visits" | "signups" | "activations";

export type ReachUpdate = {
  available: boolean;
  impressions: number | null;
  visits: number | null;
  signups: number | null;
  activations: number | null;
  visitRatePct: number | null;
  signupRatePct: number | null;
  activationRatePct: number | null;
  weakestStage: ReachStage | null;
  note: string;
};

export const B2B_STAGES = [
  "identified",
  "contacted",
  "replied",
  "meeting",
  "pilot",
  "contract",
  "active",
  "churned",
] as const;

export type B2BStage = (typeof B2B_STAGES)[number];

export type B2BNode = {
  key: string;
  stage: B2BStage;
  lastTouchAt?: number | null;
  estimatedValueCents?: number | null;
};

export type NetworkNextAction = {
  nodeKey: string;
  stage: B2BStage;
  action: string;
  reason: string;
  requiresApproval: true;
};

export type NetworkUpdate = {
  available: boolean;
  total: number;
  byStage: Record<B2BStage, number>;
  staleCount: number;
  stale: NetworkNextAction[];
  pipelineValueCents: number | null;
  activeCount: number;
  churnRiskCount: number;
  nextActions: NetworkNextAction[];
  note: string;
};

export type LoopAction = {
  id: string;
  area: "revenue" | "reach" | "network";
  title: string;
  expectedEffect: string;
  requiresApproval: boolean;
};

export type RevenueLoopInput = {
  snapshot: RevenueAutopilotSnapshot;
  targets?: RevenueAutopilotTargets;
  reach?: ReachInput | null;
  b2b?: readonly B2BNode[] | null;
  signals?: Partial<GoalRunSignals>;
  now?: number;
};

export type LoopLever = {
  key: string;
  title: string;
  hub: string;
  score: number;
  evidence: RevenueOpportunity["evidence"];
  metric: string;
  baseline: string;
  target: string;
} | null;

export type RevenueLoopDigest = {
  status: "healthy" | "optimize" | "instrument";
  lever: LoopLever;
  revenue: {
    mrrEur: number | null;
    activeSubscriptions: number | null;
    checkoutSuccessRatePct: number | null;
    invoiceSuccessRatePct: number | null;
  };
  reach: ReachUpdate;
  network: NetworkUpdate;
  actions: LoopAction[];
  directive: LoopDirective;
  blockers: string[];
  disclaimer: string;
};

export type LoopOutcome = {
  measurable: boolean;
  deltaPct: number | null;
  verdict: "scale" | "iterate" | "stop";
  reason: string;
};

export const REVENUE_LOOP_DISCLAIMER =
  "Kennzahlen stammen aus den verbundenen Messquellen. Fehlende Baseline = null, keine Schätzung.";

export const NETWORK_STALE_DAYS = 14;
export const REACH_MAX_ACTIONS = 3;
export const NETWORK_MAX_ACTIONS = 5;
export const REVENUE_MAX_ACTIONS = 5;

/** Prozentwert aus Zähler/Nenner; null bei fehlender oder unbrauchbarer Basis. */
function pct(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (typeof numerator !== "number" || typeof denominator !== "number") return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reichweiten-Trichter: wo geht am meisten verloren, gemessen in Prozent. */
export function computeReachUpdate(reach?: ReachInput | null): ReachUpdate {
  const impressions = num(reach?.impressions);
  const visits = num(reach?.visits);
  const signups = num(reach?.signups);
  const activations = num(reach?.activations);
  const visitRatePct = pct(visits, impressions);
  const signupRatePct = pct(signups, visits);
  const activationRatePct = pct(activations, signups);

  // Reihenfolge im Trichter entscheidet bei Gleichstand: die frühere Stufe
  // blockiert alles dahinter und ist damit der richtige Ansatzpunkt.
  const funnelOrder: Record<ReachStage, number> = { impressions: 0, visits: 1, signups: 2, activations: 3 };
  const rates: Array<{ stage: ReachStage; value: number }> = [];
  if (visitRatePct !== null) rates.push({ stage: "visits", value: visitRatePct });
  if (signupRatePct !== null) rates.push({ stage: "signups", value: signupRatePct });
  if (activationRatePct !== null) rates.push({ stage: "activations", value: activationRatePct });
  const weakest =
    rates.sort((a, b) => a.value - b.value || funnelOrder[a.stage] - funnelOrder[b.stage])[0] ?? null;

  const available = visits !== null || signups !== null || impressions !== null;
  return {
    available,
    impressions,
    visits,
    signups,
    activations,
    visitRatePct,
    signupRatePct,
    activationRatePct,
    weakestStage: weakest ? weakest.stage : null,
    note: available
      ? weakest
        ? `Schwächste Stufe: ${weakest.stage} (${weakest.value} %)`
        : "Reichweite erfasst, aber keine Rate berechenbar (Baseline fehlt)."
      : "Keine Reichweiten-Daten verbunden.",
  };
}

const STAGE_ACTION: Record<B2BStage, { action: string; reason: string }> = {
  identified: { action: "Qualifizierungsentwurf vorbereiten", reason: "Kontakt bekannt, noch keine Ansprache" },
  contacted: { action: "Follow-up-Entwurf vorbereiten", reason: "Ansprache offen ohne Rückmeldung" },
  replied: { action: "Terminvorschlag vorbereiten", reason: "Rückmeldung vorhanden, Termin fehlt" },
  meeting: { action: "Angebots-/Pilot-Skizze vorbereiten", reason: "Gespräch gelaufen, Entscheidung offen" },
  pilot: { action: "Pilot-Ergebnis und Abschluss-Entwurf vorbereiten", reason: "Pilot läuft, Vertrag offen" },
  contract: { action: "Onboarding-Unterlagen vorbereiten", reason: "Vertrag in Klärung" },
  active: { action: "Expansion-/Cross-Sell-Hypothese prüfen", reason: "Aktiver Kunde mit Ausbaupotenzial" },
  churned: { action: "Rückgewinnungs-Entwurf vorbereiten", reason: "Verbindung abgebrochen" },
};

const PIPELINE_STAGES: B2BStage[] = ["contacted", "replied", "meeting", "pilot", "contract"];

/** B2B-Netzwerk: Bestand, festgefahrene Kontakte und nächste Schritte. */
export function computeNetworkUpdate(
  nodes?: readonly B2BNode[] | null,
  now: number = Date.now(),
): NetworkUpdate {
  const byStage = Object.fromEntries(B2B_STAGES.map((stage) => [stage, 0])) as Record<B2BStage, number>;
  const valid: B2BNode[] = [];
  const seen = new Set<string>();

  for (const node of nodes ?? []) {
    if (!node || typeof node.key !== "string" || !node.key.trim()) continue;
    if (!B2B_STAGES.includes(node.stage)) continue;
    const key = node.key.trim();
    if (seen.has(key)) continue; // Dubletten zählen nicht doppelt
    seen.add(key);
    byStage[node.stage] += 1;
    valid.push({ ...node, key });
  }

  const staleAfterMs = NETWORK_STALE_DAYS * 24 * 60 * 60 * 1000;
  const isStale = (node: B2BNode) => {
    if (node.stage === "active" || node.stage === "churned") return false;
    const touched = num(node.lastTouchAt);
    if (touched === null) return true; // ohne Kontaktspur gilt als unbearbeitet
    return now - touched >= staleAfterMs;
  };

  const stale = valid
    .filter(isStale)
    .sort(
      (a, b) =>
        (num(b.estimatedValueCents) ?? 0) - (num(a.estimatedValueCents) ?? 0) || a.key.localeCompare(b.key),
    )
    .slice(0, NETWORK_MAX_ACTIONS)
    .map((node) => ({
      nodeKey: node.key,
      stage: node.stage,
      action: STAGE_ACTION[node.stage].action,
      reason: `${STAGE_ACTION[node.stage].reason}; seit über ${NETWORK_STALE_DAYS} Tagen ohne Bewegung`,
      requiresApproval: true as const,
    }));

  const actionable = valid
    .filter((node) => node.stage !== "active" && node.stage !== "churned")
    .sort(
      (a, b) =>
        (num(b.estimatedValueCents) ?? 0) - (num(a.estimatedValueCents) ?? 0) ||
        B2B_STAGES.indexOf(b.stage) - B2B_STAGES.indexOf(a.stage) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, NETWORK_MAX_ACTIONS)
    .map((node) => ({
      nodeKey: node.key,
      stage: node.stage,
      action: STAGE_ACTION[node.stage].action,
      reason: STAGE_ACTION[node.stage].reason,
      requiresApproval: true as const,
    }));

  const pipelineValues = valid
    .filter((node) => PIPELINE_STAGES.includes(node.stage))
    .map((node) => num(node.estimatedValueCents));
  const pipelineValueCents = pipelineValues.some((value) => value === null)
    ? null
    : pipelineValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return {
    available: valid.length > 0,
    total: valid.length,
    byStage,
    staleCount: valid.filter(isStale).length,
    stale,
    pipelineValueCents,
    activeCount: byStage.active,
    churnRiskCount: byStage.churned,
    nextActions: actionable,
    note:
      valid.length === 0
        ? "Kein B2B-Netzwerk verbunden."
        : `${valid.length} Kontakte, ${valid.filter(isStale).length} ohne Bewegung seit ${NETWORK_STALE_DAYS} Tagen.`,
  };
}

/** Größter Hebel: höchster Score, bei Gleichstand alphabetisch (deterministisch). */
export function selectLever(opportunities: readonly RevenueOpportunity[]): LoopLever {
  const ranked = [...opportunities].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const top = ranked[0];
  if (!top) return null;
  return {
    key: top.key,
    title: top.title,
    hub: String(top.hub),
    score: top.score,
    evidence: top.evidence,
    metric: top.metric,
    baseline: top.baseline,
    target: top.target,
  };
}

function buildActions(
  lever: LoopLever,
  reach: ReachUpdate,
  network: NetworkUpdate,
): LoopAction[] {
  const actions: LoopAction[] = [];
  if (lever) {
    actions.push({
      id: `revenue:${lever.key}`,
      area: "revenue",
      title: `Hebel bearbeiten: ${lever.title}`,
      expectedEffect: `${lever.metric}: ${lever.baseline} → ${lever.target}`,
      requiresApproval: false, // interne Auswertung/Entwurf
    });
  }
  if (reach.weakestStage) {
    actions.push({
      id: `reach:${reach.weakestStage}`,
      area: "reach",
      title: `Reichweite stärken an der Stufe ${reach.weakestStage}`,
      expectedEffect: `Trichterrate ${reach.weakestStage} verbessern, ohne Annahmen über Höhe`,
      requiresApproval: false,
    });
  }
  for (const next of network.nextActions.slice(0, NETWORK_MAX_ACTIONS)) {
    actions.push({
      id: `network:${next.nodeKey}`,
      area: "network",
      title: `${next.action} (${next.nodeKey})`,
      expectedEffect: next.reason,
      requiresApproval: next.requiresApproval,
    });
  }
  return actions
    .sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id))
    .slice(0, REVENUE_MAX_ACTIONS + REACH_MAX_ACTIONS + NETWORK_MAX_ACTIONS);
}

/** Eine Loop-Iteration: messen, priorisieren, handeln (Entwurf), Direktive bestimmen. */
export function buildRevenueLoopDigest(input: RevenueLoopInput): RevenueLoopDigest {
  const targets = input.targets ?? DEFAULT_REVENUE_AUTOPILOT_TARGETS;
  const now = input.now ?? Date.now();
  const opportunities = buildRevenueOpportunities(input.snapshot, targets);
  const status = revenueAutopilotStatus(opportunities);
  const lever = selectLever(opportunities);
  const reach = computeReachUpdate(input.reach);
  const network = computeNetworkUpdate(input.b2b, now);

  const signals: GoalRunSignals = {
    iterationCount: input.signals?.iterationCount ?? 0,
    maxIterations: input.signals?.maxIterations,
    signatures: input.signals?.signatures ?? [],
    progressSamples: input.signals?.progressSamples ?? [],
    consecutiveFailures: input.signals?.consecutiveFailures ?? 0,
  };

  const blockers: string[] = [];
  if (!reach.available) blockers.push("Keine Reichweiten-Daten: Trichter nicht bewertbar.");
  if (!network.available) blockers.push("Kein B2B-Netzwerk verbunden: keine Kontaktfolge möglich.");
  if (input.snapshot.mrrEur === null || input.snapshot.mrrEur === undefined) {
    blockers.push("Kein MRR gemessen: Umsatz-Urteil bleibt offen.");
  }

  return {
    status,
    lever,
    revenue: {
      mrrEur: num(input.snapshot.mrrEur),
      activeSubscriptions: num(input.snapshot.activeSubscriptions),
      checkoutSuccessRatePct: num(input.snapshot.stripeCheckoutSuccessRate),
      invoiceSuccessRatePct: num(input.snapshot.invoiceSuccessRate),
    },
    reach,
    network,
    actions: buildActions(lever, reach, network),
    directive: nextLoopDirective(signals),
    blockers,
    disclaimer: REVENUE_LOOP_DISCLAIMER,
  };
}

/**
 * Lernschritt: hat die Iteration gewirkt?
 * Unter ±2 % gilt das Ergebnis als nicht entschieden ("iterate"), damit ein
 * Rauschen nicht als Erfolg oder Fehlschlag verbucht wird.
 */
export function evaluateLoopOutcome(
  before: RevenueLoopDigest,
  after: RevenueLoopDigest,
): LoopOutcome {
  const a = before.revenue.mrrEur;
  const b = after.revenue.mrrEur;
  if (a === null || b === null || a <= 0) {
    return {
      measurable: false,
      deltaPct: null,
      verdict: "iterate",
      reason: "Nicht messbar: MRR-Baseline fehlt oder ist 0.",
    };
  }
  const deltaPct = Math.round(((b - a) / a) * 1000) / 10;
  if (deltaPct >= 2) return { measurable: true, deltaPct, verdict: "scale", reason: `MRR +${deltaPct} %` };
  if (deltaPct <= -2) return { measurable: true, deltaPct, verdict: "stop", reason: `MRR ${deltaPct} %` };
  return {
    measurable: true,
    deltaPct,
    verdict: "iterate",
    reason: `MRR ${deltaPct} % (innerhalb ±2 %, noch keine Entscheidung)`,
  };
}

/** Verdichtete Textzeilen für Logs/Reports (ohne Rohdaten-PII). */
export function revenueLoopSummaryLines(digest: RevenueLoopDigest): string[] {
  const mrr = digest.revenue.mrrEur === null ? "n/a" : `${digest.revenue.mrrEur} EUR`;
  const lever = digest.lever ? `${digest.lever.title} (Score ${digest.lever.score})` : "kein Hebel";
  return [
    `Status: ${digest.status} | MRR: ${mrr} | Hebel: ${lever}`,
    `Reichweite: ${digest.reach.note}`,
    `B2B: ${digest.network.note}`,
    `Aktionen: ${digest.actions.length}, davon freigabepflichtig ${digest.actions.filter((a) => a.requiresApproval).length}`,
    `Direktive: ${digest.directive.action} (${digest.directive.reason})`,
  ];
}

/** Rohe B2B-Knoten aus der Datenbank (nur die für den Loop nötigen Felder). */
export type NetworkNodeRecord = {
  nodeKey: string;
  kind: string;
  relationshipStrength: number;
  estimatedValueCents?: number | null;
  lastActivityAt?: number | null;
  optedOut?: boolean;
};

/** Rohe B2B-Kante; die Stufe ist die belastbarste Aussage über den Kontakt. */
export type NetworkEdgeRecord = {
  fromNodeKey: string;
  toNodeKey: string;
  stage: string;
  strength: number;
};

const EDGE_STAGE_TO_B2B: Record<string, { stage: B2BStage; rank: number }> = {
  customer: { stage: "active", rank: 6 },
  partner: { stage: "contract", rank: 5 },
  engaged: { stage: "meeting", rank: 4 },
  qualified: { stage: "replied", rank: 3 },
  discovered: { stage: "contacted", rank: 2 },
  paused: { stage: "churned", rank: 1 },
};

/**
 * Leitet die B2B-Stufe je Knoten ab: zuerst aus der stärksten Kante
 * (gemessene Beziehung), sonst aus Art und Beziehungsstärke. Abgemeldete
 * Kontakte (optedOut) werden nicht geführt und nicht angesprochen.
 */
export function deriveNetworkStages(
  nodes: readonly NetworkNodeRecord[],
  edges: readonly NetworkEdgeRecord[] = [],
): B2BNode[] {
  const bestEdge = new Map<string, { stage: B2BStage; rank: number; strength: number }>();
  for (const edge of edges) {
    const mapping = EDGE_STAGE_TO_B2B[String(edge.stage ?? "")];
    if (!mapping) continue;
    const strength = Number.isFinite(edge.strength) ? edge.strength : 0;
    for (const key of [edge.fromNodeKey, edge.toNodeKey]) {
      if (typeof key !== "string" || !key.trim()) continue;
      const current = bestEdge.get(key);
      if (!current || mapping.rank > current.rank || (mapping.rank === current.rank && strength > current.strength)) {
        bestEdge.set(key, { stage: mapping.stage, rank: mapping.rank, strength });
      }
    }
  }

  const result: B2BNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node.nodeKey !== "string" || !node.nodeKey.trim()) continue;
    if (node.optedOut) continue;
    const fromEdge = bestEdge.get(node.nodeKey);
    let stage: B2BStage;
    if (fromEdge) {
      stage = fromEdge.stage;
    } else if (node.kind === "customer") {
      stage = "active";
    } else if (node.kind === "partner") {
      stage = "contract";
    } else {
      const strength = Number.isFinite(node.relationshipStrength) ? node.relationshipStrength : 0;
      stage = strength >= 60 ? "replied" : strength >= 30 ? "contacted" : "identified";
    }
    result.push({
      key: node.nodeKey.trim(),
      stage,
      lastTouchAt: num(node.lastActivityAt),
      estimatedValueCents: num(node.estimatedValueCents),
    });
  }
  return result;
}

/** Reichweiten-Sicht aus dem gemessenen Funnel: Sitzungen, Anmeldungen, Upgrades. */
export function reachFromSnapshot(snapshot: RevenueAutopilotSnapshot): ReachInput {
  return {
    // Impressionen werden nicht gemessen; null statt Schätzung.
    impressions: null,
    visits: num(snapshot.landingViews),
    signups: num(snapshot.signups),
    activations: num(snapshot.upgrades),
  };
}

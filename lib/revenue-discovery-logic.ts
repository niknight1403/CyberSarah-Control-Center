/**
 * Umsatz-Discovery: findet Kandidaten fuer neue oder integrierbare
 * Umsatzmoeglichkeiten und bewertet sie nachvollziehbar.
 *
 * Bewusste Grenze: diese Datei entscheidet nichts Externes. Sie liefert
 * Bewertung und Integrationsschritt; das Anlegen echter Produkte, Preise oder
 * Kampagnen bleibt bei der Freigabe. Was sie darf: einen Kandidaten als
 * "integrierbar" einstufen, wenn die Belege vollstaendig sind.
 *
 * Wahrheitsregel: es gibt keine prognostizierten Eurobetraege. Bewertet wird
 * nur, was als Signal vorliegt (Nachfrage, Passung, Marge, Aufwand, Risiko).
 */
import type { DraftHubId } from "./hub-draft-coverage-logic";

/** Woher ein Kandidat stammt. */
export type DiscoverySourceId =
  | "affiliate-catalog"
  | "offer-gap"
  | "loop-gap"
  | "integration-gap"
  | "partner-signal"
  | "marketplace-scan";

export type DiscoverySource = {
  id: DiscoverySourceId;
  label: string;
  /** Wo die Signale herkommen — nachpruefbar, nicht "irgendwo aus dem Netz". */
  origin: string;
  /** Was der Agent daraus automatisch ableiten kann. */
  yields: string;
  /** automatisch / mit Unterstuetzung / nur Mensch. */
  automation: "autopilot" | "assisted" | "manual";
  /** Beleg, ohne den kein "integrierbar" entsteht. */
  evidence: string;
};

export const DISCOVERY_SOURCES: readonly DiscoverySource[] = [
  {
    id: "affiliate-catalog",
    label: "Affiliate-Katalog",
    origin: "Tabelle affiliate_products inkl. Score und Provision",
    yields: "Produkte mit Nachfragesignal, die noch keinen Content-Loop haben",
    automation: "autopilot",
    evidence: "Score oder Provision vorhanden, Produkt aktiv",
  },
  {
    id: "offer-gap",
    label: "Angebotsluecke je Bereich",
    origin: "Tabelle revenue_offers gegen die acht Hubs",
    yields: "Bereich mit Reichweite, aber ohne aktives Angebot",
    automation: "autopilot",
    evidence: "mindestens ein offener Entwurf im Bereich, aber kein aktives Angebot",
  },
  {
    id: "loop-gap",
    label: "Fehlender Umsatz-Loop",
    origin: "Loop-Entwuerfe der Draft-Queue",
    yields: "Bereich ohne Loop-Engineering-Entwurf",
    automation: "autopilot",
    evidence: "kein offener oder freigegebener Loop-Entwurf fuer den Bereich",
  },
  {
    id: "integration-gap",
    label: "Rote Integration",
    origin: "Integrations-Registry (ENV-Readiness)",
    yields: "Bezahl- oder Versandweg fehlt, obwohl Inhalt produziert wird",
    automation: "autopilot",
    evidence: "Registry meldet fehlende ENV oder nicht bereit",
  },
  {
    id: "partner-signal",
    label: "Partner-/B2B-Signal",
    origin: "B2B-Netzwerk und eingehende Anfragen",
    yields: "Kooperation oder Weiterempfehlung mit konkretem Anlass",
    automation: "assisted",
    evidence: "bestehender Kontakt mit dokumentiertem Interesse",
  },
  {
    id: "marketplace-scan",
    label: "Marktplatz-Suche",
    origin: "Plattform-API (Digistore24/Stripe-Katalog)",
    yields: "Neue Produkte mit Provisions- und Nachfragedaten",
    automation: "assisted",
    evidence: "API-Antwort mit Provisions- oder Verkaufsdaten",
  },
] as const;

export function getDiscoverySource(id: DiscoverySourceId): DiscoverySource | undefined {
  return DISCOVERY_SOURCES.find((source) => source.id === id);
}

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

/** Fuenf Signale, jedes 0..100. Alles andere wird nicht bewertet. */
export type OpportunitySignals = {
  /** Wie deutlich ist die Nachfrage belegt (Suchvolumen, Verkaeufe, Anfragen)? */
  demand: number;
  /** Wie gut passt es zu Hub, Persona und Zielgruppe? */
  fit: number;
  /** Wie hoch ist die Marge bzw. Provision? */
  margin: number;
  /** Wie viel Aufwand bis zum ersten Test? 0 = viel Aufwand, 100 = trivial. */
  ease: number;
  /** Wie viel Risiko (rechtlich, Reputation, Abhaengigkeit)? 0 = hoch, 100 = gering. */
  safety: number;
};

export const DISCOVERY_WEIGHTS: Readonly<Record<keyof OpportunitySignals, number>> = {
  demand: 0.3,
  fit: 0.25,
  margin: 0.2,
  ease: 0.15,
  safety: 0.1,
};

export type OpportunityVerdict = "integrate" | "test" | "review" | "skip";

export type OpportunityScore = {
  score: number;
  verdict: OpportunityVerdict;
  /** Warum genau diese Einstufung — im Klartext fuer die Freigabe. */
  reason: string;
  /** Fehlende Belege, die ein "integrierbar" verhindern. */
  blockers: string[];
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Gewichtete Bewertung mit zwei harten Deckeln:
 * - ohne vollstaendige Belege kein "integrate",
 * - hohes Risiko (safety < 40) fuehrt hoechstens zu "test".
 * Damit ist "autonom integrierbar" eine Aussage ueber Belege, nicht ueber Mut.
 */
export function scoreOpportunity(signals: OpportunitySignals, evidenceComplete = true): OpportunityScore {
  const normalized: OpportunitySignals = {
    demand: clamp(signals.demand),
    fit: clamp(signals.fit),
    margin: clamp(signals.margin),
    ease: clamp(signals.ease),
    safety: clamp(signals.safety),
  };
  const score = clamp(
    (Object.keys(DISCOVERY_WEIGHTS) as (keyof OpportunitySignals)[]).reduce(
      (sum, key) => sum + normalized[key] * DISCOVERY_WEIGHTS[key],
      0,
    ),
  );

  const blockers: string[] = [];
  if (!evidenceComplete) blockers.push("Beleg unvollstaendig (Nachfrage oder Provisionsdaten fehlen)");
  if (normalized.fit < 50) blockers.push("Passung zu Hub/Zielgruppe zu schwach");
  if (normalized.safety < 40) blockers.push("Risiko zu hoch fuer eine automatische Integration");

  let verdict: OpportunityVerdict;
  let reason: string;

  if (score >= 70 && evidenceComplete) {
    verdict = "integrate";
    reason = `Score ${score}: Nachfrage, Passung und Marge tragen eine Integration.`;
  } else if (score >= 70 && !evidenceComplete) {
    verdict = "test";
    reason = `Score ${score}, aber Belege fehlen — erst ein kleiner Test, dann Integration.`;
  } else if (score >= 50) {
    verdict = "test";
    reason = `Score ${score}: aussichtsreich, aber noch kein Fall fuer eine direkte Integration.`;
  } else if (score >= 30) {
    verdict = "review";
    reason = `Score ${score}: nur pruefen, wenn ein staerkeres Signal dazukommt.`;
  } else {
    verdict = "skip";
    reason = `Score ${score}: Aufwand und Signal passen nicht zusammen.`;
  }

  if (normalized.safety < 40 && verdict === "integrate") {
    verdict = "test";
    reason = `Score ${score}, aber hohes Risiko — erst testen, nicht integrieren.`;
  }

  return { score, verdict, reason, blockers };
}

// ---------------------------------------------------------------------------
// Kandidaten
// ---------------------------------------------------------------------------

export type OpportunityCandidate = {
  source: DiscoverySourceId;
  hub: DraftHubId;
  /** Eindeutiges Subjekt der Quelle (Slug, Angebotsname, Integrationsschluessel). */
  subject: string;
  title: string;
  /** Was konkret der Umsatzweg waere. */
  revenuePath: string;
  /** Der naechste echte Schritt, den ein Mensch freigibt. */
  integrationStep: string;
  signals: OpportunitySignals;
  evidenceComplete: boolean;
  /** Bereits vorhandene Belege in Klartext (fuer die Freigabe). */
  evidenceNotes: string[];
};

export type ScoredCandidate = OpportunityCandidate & OpportunityScore & {
  dedupeKey: string;
  periodKey: string;
};

export function slidingPeriodKey(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getUTCFullYear();
  const week = Math.floor((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function opportunityDedupeKey(candidate: OpportunityCandidate, periodKey: string): string {
  const subject = candidate.subject
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `discovery:${candidate.source}:${subject}:${periodKey}`;
}

/** Bewertet alle Kandidaten und sortiert die lohnendsten nach oben. */
export function rankCandidates(
  candidates: readonly OpportunityCandidate[],
  nowMs: number,
): ScoredCandidate[] {
  const periodKey = slidingPeriodKey(nowMs);
  return candidates
    .map((candidate) => {
      const scored = scoreOpportunity(candidate.signals, candidate.evidenceComplete);
      return { ...candidate, ...scored, dedupeKey: opportunityDedupeKey(candidate, periodKey), periodKey };
    })
    .sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject));
}

export const DISCOVERY_VERDICT_LABELS: Readonly<Record<OpportunityVerdict, string>> = {
  integrate: "integrierbar",
  test: "testen",
  review: "beobachten",
  skip: "verwerfen",
};

export type DiscoveryPlan = {
  periodKey: string;
  integrate: ScoredCandidate[];
  test: ScoredCandidate[];
  review: ScoredCandidate[];
  skip: ScoredCandidate[];
  /** Kandidaten, die in diesem Lauf als Entwurf entstehen sollen. */
  toDraft: ScoredCandidate[];
};

/**
 * Waehlt, was in die Entwurfs-Queue geht: integrierbare und testbare
 * Kandidaten, hoechstens `maxDrafts` Stueck, keine Duplikate.
 */
export function planDiscoveryRun(
  candidates: readonly OpportunityCandidate[],
  options: { nowMs: number; maxDrafts?: number; alreadyDrafted?: readonly string[] },
): DiscoveryPlan {
  const ranked = rankCandidates(candidates, options.nowMs);
  const maxDrafts = Math.max(0, options.maxDrafts ?? 4);
  const known = new Set(options.alreadyDrafted ?? []);
  const eligible = ranked.filter(
    (candidate) => (candidate.verdict === "integrate" || candidate.verdict === "test") && !known.has(candidate.dedupeKey),
  );
  return {
    periodKey: slidingPeriodKey(options.nowMs),
    integrate: ranked.filter((candidate) => candidate.verdict === "integrate"),
    test: ranked.filter((candidate) => candidate.verdict === "test"),
    review: ranked.filter((candidate) => candidate.verdict === "review"),
    skip: ranked.filter((candidate) => candidate.verdict === "skip"),
    toDraft: eligible.slice(0, maxDrafts),
  };
}

/** Entwurfstext fuer die Freigabe: was, warum, naechster Schritt. */
export function buildOpportunityDraft(candidate: ScoredCandidate): {
  kind: "idea";
  title: string;
  payload: { note: string; rationale: string };
} {
  const source = getDiscoverySource(candidate.source);
  const note = `${candidate.title} (${DISCOVERY_VERDICT_LABELS[candidate.verdict]}, Score ${candidate.score})`.slice(0, 300);
  const rationale = [
    `Quelle: ${source?.label ?? candidate.source} — ${source?.origin ?? "unbekannt"}.`,
    `Umsatzweg: ${candidate.revenuePath}`,
    `Naechster Schritt: ${candidate.integrationStep}`,
    `Bewertung: ${candidate.reason}`,
    candidate.evidenceNotes.length > 0 ? `Belege: ${candidate.evidenceNotes.join("; ")}` : "Belege: keine — deshalb kein direkter Integrationsvorschlag.",
    candidate.blockers.length > 0 ? `Offen: ${candidate.blockers.join("; ")}` : "Keine Blocker.",
    "Keine Umsatzprognose: Bewertung erfolgt aus Signalen, nicht aus geschaetzten Erloesen.",
  ]
    .join("\n")
    .slice(0, 600);
  return { kind: "idea", title: note.slice(0, 120), payload: { note, rationale } };
}

/**
 * Filter fuer den naechsten Autopilot-Lauf: nur Kandidaten, deren Quelle
 * wirklich automatisch ausgewertet werden darf.
 */
export function automatableCandidates(candidates: readonly OpportunityCandidate[]): OpportunityCandidate[] {
  return candidates.filter((candidate) => getDiscoverySource(candidate.source)?.automation === "autopilot");
}

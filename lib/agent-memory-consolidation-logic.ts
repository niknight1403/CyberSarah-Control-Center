/**
 * Sprint 113 — Memory-Konsolidierung (Sleep-Time): reine, deterministische
 * Logik fuer die naechtliche Pflege des Langzeit-Gedaechtnisses (Sprint 94,
 * agentLearnings). Der Master-Agent sammelt Learnings im Betrieb; dieses
 * Modul entscheidet rein, wie der Bestand konsolidiert wird:
 *
 *   - aehnliche Learnings zusammenfuehren (Merge-Gruppen ueber Keyword-Overlap
 *     und Titel-Aehnlichkeit, aeltester Eintrag bleibt als Traeger)
 *   - veraltete, informationslose Learnings invalidieren (Interaktions-Rauschen
 *     ohne Schluesselwoerter, Mini-Details, sehr alt)
 *   - Widersprueche markieren (gleiches Thema, gegenlaeufige Polaritaet) —
 *     markiert statt geloescht, damit der Admin entscheiden kann
 *   - Retrieval-Qualitaet messbar machen (Trefferquote der Top-3-Injektion)
 *
 * Die Konsolidierung ist bewusst konservativ: nur eindeutige Duplikate und
 * klares Rauschen werden entfernt. Alles andere bleibt im Bestand. Merger
 * behalten das urspruengliche createdAt des Traegers, damit die Chronologie
 * erhalten bleibt. Alles ohne externe Keys, ohne LLM-Aufrufe — reine Regeln.
 */

import { extractLearningKeywords, MAX_LEARNING_KEYWORDS } from "./agent-memory-logic";

/* ==================== Typen ==================== */

export type ConsolidationLearning = {
  id: number;
  kind: string;
  title: string;
  detail: string;
  keywords: string;
  createdAt: number; // epoch ms
};

export type MergePlan = {
  keepId: number;
  mergedIds: number[]; // wegfallende Learnings (ausser dem Traeger)
  mergedKeywords: string; // Vereinigung, gekappt auf MAX_LEARNING_KEYWORDS
};

export type InvalidationPlan = {
  id: number;
  reason: string; // tokenfrei, fuer Logs/Admin
};

export type ContradictionPlan = {
  newerId: number;
  olderId: number;
  note: string; // tokenfrei
};

export type ConsolidationPlan = {
  merges: MergePlan[];
  invalidations: InvalidationPlan[];
  contradictions: ContradictionPlan[];
  survivors: number; // Bestandsgroesse nach Anwendung des Plans
  stats: {
    input: number;
    survivors: number;
    mergedAway: number;
    invalidated: number;
    contradictionCount: number;
    dedupRatePct: number; // (mergedAway + invalidated) / input
  };
};

export type ConsolidationOptions = {
  now?: number;
  mergeSimilarityThreshold?: number;
  staleAfterDays?: number;
};

/* ==================== Konstanten ==================== */

/** Keyword-Overlap (Jaccard), ab dem zwei Learnings als Duplikat gelten. */
export const MERGE_SIMILARITY_THRESHOLD = 0.6;

/** Titel-Normalisierung: aehnliche Titel gelten als gleiches Thema. */
const TITLE_MATCH_THRESHOLD = 0.8;

/** Titel muessen mindestens so viele Sinnwoerter haben, damit die Titel-Route greift —
 *  generische Ein-Wort-Titel ("Learning 3") verschmelzen sonst grundlos. */
const TITLE_ROUTE_MIN_WORDS = 3;

/** Learnings dieses Alters gelten als veraltet (Stichwort: 4 Monate). */
export const STALE_AFTER_DAYS = 120;

/** Ein veraltetes Learning ist nur Rauschen, wenn es keine Keywords tragt … */
const STALE_MAX_KEYWORDS = 1;

/** … und/oder kaum Substanz im Detail hat. */
const STALE_MAX_DETAIL_CHARS = 24;

/** Polaritaets-Marker fuer Widerspruchs-Erkennung (kleingeschrieben). */
const NEGATIVE_MARKERS = [
  "kaputt", "blockiert", "blockier", "schlaegt fehl", "schlug fehl", "fehlgeschlagen",
  "broken", "not working", "nicht moeglich", "nicht verfuegbar", "down",
];
const POSITIVE_MARKERS = [
  "beho", "gefixt", "gebehe", "funktioniert", "erfolgreich", "geloest", "resolved",
  "gruen", "wieder da", "reparier",
];

/* ==================== Aehnlichkeit ==================== */

function keywordSet(keywords: string): Set<string> {
  return new Set(
    keywords
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Jaccard-Aehnlichkeit zweier Keyword-Mengen: |A ∩ B| / |A ∪ B|. */
export function keywordSimilarity(aKeywords: string, bKeywords: string): number {
  const a = keywordSet(aKeywords);
  const b = keywordSet(bKeywords);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/** Titel-Normalisierung fuer Themen-Vergleich (klein, ohne Fuellzeichen). */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWordSet(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((word) => word.length >= 3));
}

/** Titelaehnlichkeit: Wortmengen-Overlap (Jaccard) — roh, aber wirksam. */
function titleSimilarity(aTitle: string, bTitle: string): number {
  const a = titleWordSet(aTitle);
  const b = titleWordSet(bTitle);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/** Die Titel-Route gilt nur fuer inhaltsvolle Titel auf beiden Seiten. */
function titlesComparable(aTitle: string, bTitle: string): boolean {
  return titleWordSet(aTitle).size >= TITLE_ROUTE_MIN_WORDS && titleWordSet(bTitle).size >= TITLE_ROUTE_MIN_WORDS;
}

/** Zwei Learnings sind Duplikat-Kandidaten: starker Keyword-Overlap ODER fast gleicher Titel. */
export function areLearningsSimilar(
  a: ConsolidationLearning,
  b: ConsolidationLearning,
  threshold = MERGE_SIMILARITY_THRESHOLD,
): boolean {
  if (keywordSimilarity(a.keywords, b.keywords) >= threshold) return true;
  return titlesComparable(a.title, b.title) && titleSimilarity(a.title, b.title) >= TITLE_MATCH_THRESHOLD;
}

/* ==================== Merge-Gruppen ==================== */

/**
 * Findet Gruppen aehnlicher Learnings (union-find ueber Paar-Aehnlichkeit).
 * Ein Learning kann nur in einer Gruppe landen; Gruppen mit nur einem
 * Mitglied sind keine Merge-Gruppen. Reihenfolge-stabil: Gruppen werden
 * nach dem ersten Vorkommen geordnet.
 */
export function findMergeGroups(
  learnings: ConsolidationLearning[],
  threshold?: number,
): ConsolidationLearning[][] {
  const parent = learnings.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let i = 0; i < learnings.length; i += 1) {
    for (let j = i + 1; j < learnings.length; j += 1) {
      if (areLearningsSimilar(learnings[i], learnings[j], threshold)) union(i, j);
    }
  }
  const groups = new Map<number, ConsolidationLearning[]>();
  learnings.forEach((learning, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(learning);
    groups.set(root, group);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

/** Traeger einer Gruppe: aeltester Eintrag (createdAt, dann niedrigste ID). */
function pickGroupKeeper(group: ConsolidationLearning[]): ConsolidationLearning {
  return [...group].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)[0];
}

/** Vereinigt die Keywords einer Gruppe, gekappt auf das Prompt-Budget. */
function mergeGroupKeywords(group: ConsolidationLearning[]): string {
  const seen = new Set<string>();
  for (const learning of group) {
    for (const word of keywordSet(learning.keywords)) seen.add(word);
    for (const word of extractLearningKeywords(`${learning.title} ${learning.detail}`)) seen.add(word);
  }
  return [...seen].slice(0, MAX_LEARNING_KEYWORDS).join(",");
}

/* ==================== Veraltung ==================== */

/**
 * Ein Learning ist veraltetes Rauschen, wenn es aelter als staleAfterDays ist
 * UND keine nennenswerten Schluesselwoerter traegt UND kaum Substanz hat.
 * Konventions- und Fehlerbehebungs-Learnings bleiben bewusst stehen — sie
 * sind das wertvollste Wissen.
 */
export function isStaleLearning(learning: ConsolidationLearning, now: number, staleAfterDays = STALE_AFTER_DAYS): false | string {
  const ageDays = (now - learning.createdAt) / (1000 * 60 * 60 * 24);
  if (ageDays < staleAfterDays) return false;
  if (learning.kind === "entscheidung" || learning.kind === "fehlerbehebung") return false;
  const keywordCount = keywordSet(learning.keywords).size;
  if (keywordCount <= STALE_MAX_KEYWORDS && learning.detail.trim().length <= STALE_MAX_DETAIL_CHARS) {
    return `veraltet (${Math.floor(ageDays)} Tage) und ohne Substanz`;
  }
  return false;
}

/* ==================== Widersprueche ==================== */

function hasMarker(text: string, markers: string[]): boolean {
  const haystack = text.toLowerCase();
  return markers.some((marker) => haystack.includes(marker));
}

/**
 * Zwei Learnings widersprechen sich, wenn sie dasselbe Thema behandeln
 * (starker Titel-Overlap) und gegenlaeufige Polaritaet tragen (negativ vs.
 * positiv). Konsolidierung markiert nur — geloescht wird nichts.
 */
export function findContradictions(learnings: ConsolidationLearning[]): ContradictionPlan[] {
  const contradictions: ContradictionPlan[] = [];
  for (let i = 0; i < learnings.length; i += 1) {
    for (let j = i + 1; j < learnings.length; j += 1) {
      const a = learnings[i];
      const b = learnings[j];
      if (!titlesComparable(a.title, b.title) || titleSimilarity(a.title, b.title) < TITLE_MATCH_THRESHOLD) continue;
      const aNegative = hasMarker(`${a.title} ${a.detail}`, NEGATIVE_MARKERS);
      const bNegative = hasMarker(`${b.title} ${b.detail}`, NEGATIVE_MARKERS);
      const aPositive = hasMarker(`${a.title} ${a.detail}`, POSITIVE_MARKERS);
      const bPositive = hasMarker(`${b.title} ${b.detail}`, POSITIVE_MARKERS);
      if (aNegative && bPositive && !aPositive) {
        contradictions.push(contradictionEntry(b, a));
      } else if (bNegative && aPositive && !bPositive) {
        contradictions.push(contradictionEntry(a, b));
      }
    }
  }
  return contradictions;
}

function contradictionEntry(positive: ConsolidationLearning, negative: ConsolidationLearning): ContradictionPlan {
  const newer = positive.createdAt >= negative.createdAt ? positive : negative;
  const older = newer.id === positive.id ? negative : positive;
  return { newerId: newer.id, olderId: older.id, note: "gegenlaeufige Polaritaet bei gleichem Thema" };
}

/* ==================== Gesamtplan ==================== */

/**
 * Baut den vollstaendigen Konsolidierungsplan. Anwendung (DB-Writes) liegt in
 * server/memory-consolidation.ts; dieses Modul bleibt rein und testbar.
 */
export function buildConsolidationPlan(
  learnings: ConsolidationLearning[],
  options: ConsolidationOptions = {},
): ConsolidationPlan {
  const now = options.now ?? 0;
  const staleAfterDays = options.staleAfterDays ?? STALE_AFTER_DAYS;
  const threshold = options.mergeSimilarityThreshold ?? MERGE_SIMILARITY_THRESHOLD;

  const merges: MergePlan[] = [];
  const invalidations: InvalidationPlan[] = [];
  const contradictions = findContradictions(learnings);

  // Merge-Gruppen: Traeger bleibt, Rest faellt weg. Der Traeger erbt die
  // vereinigten Keywords der Gruppe — er ist danach nie "Rauschen ohne
  // Substanz", selbst wenn er vorher eines war.
  const mergedAwayIds = new Set<number>();
  const keeperIds = new Set<number>();
  for (const group of findMergeGroups(learnings, threshold)) {
    const keeper = pickGroupKeeper(group);
    const mergedIds = group.filter((learning) => learning.id !== keeper.id).map((learning) => learning.id);
    mergedIds.forEach((id) => mergedAwayIds.add(id));
    keeperIds.add(keeper.id);
    merges.push({ keepId: keeper.id, mergedIds, mergedKeywords: mergeGroupKeywords(group) });
  }

  for (const learning of learnings) {
    if (mergedAwayIds.has(learning.id) || keeperIds.has(learning.id)) continue;
    const reason = isStaleLearning(learning, now, staleAfterDays);
    if (reason) invalidations.push({ id: learning.id, reason });
  }

  const input = learnings.length;
  const mergedAway = merges.reduce((sum, merge) => sum + merge.mergedIds.length, 0);
  const invalidated = invalidations.length;
  return {
    merges,
    invalidations,
    contradictions,
    survivors: input - mergedAway - invalidated,
    stats: {
      survivors: input - mergedAway - invalidated,
      input,
      mergedAway,
      invalidated,
      contradictionCount: contradictions.length,
      dedupRatePct: input > 0 ? Math.round(((mergedAway + invalidated) / input) * 100) : 0,
    },
  };
}

/** Tokenfreie einzeilige Zusammenfassung fuer Logs und Admin-Sicht. */
export function formatConsolidationSummary(plan: ConsolidationPlan, trigger: string): string {
  const { stats } = plan;
  return `Konsolidierung (${trigger}): ${stats.input} Learnings → ${stats.survivors} behalten, ${stats.mergedAway} zusammengefuehrt, ${stats.invalidated} entfernt, ${stats.contradictionCount} Widersprueche markiert.`;
}

/* ==================== Retrieval-Qualitaetsmetriken ==================== */

export type RetrievalSample = {
  injected: number; // injizierte Learnings im Turn
  hits: number; // davon trafen spaetere Nutzer Nachrichten
};

export type RetrievalMetrics = {
  samples: number;
  hitRatePct: number; // Anteil Turn-Injektionen mit mind. 1 Treffer
  avgInjections: number; // durchschnittlich injizierte Learnings je Turn
};

/**
 * Misst, wie viele der fuer einen Turn injizierten Learnings in den
 * nachfolgenden Nutzer-Nachrichten "getroffen" wurden (Keyword-Overlap).
 * Ein Learning zaehlt als Treffer, wenn mindestens eines seiner Keywords
 * in einer spaeteren Nachricht vorkommt — wiederverwendetes Wissen also.
 */
export function measureRetrievalHits(
  injectedKeywords: string[][],
  subsequentText: string,
): number {
  const haystack = subsequentText.toLowerCase();
  return injectedKeywords.filter((keywords) =>
    keywords.some((keyword) => keyword.trim().length >= 3 && haystack.includes(keyword.toLowerCase())),
  ).length;
}

/** Aggregiert einzelne Turn-Stichproben zu Trefferquote-Metriken. */
export function aggregateRetrievalMetrics(samples: RetrievalSample[]): RetrievalMetrics {
  const turns = samples.length;
  if (turns === 0) return { samples: 0, hitRatePct: 0, avgInjections: 0 };
  const hitTurns = samples.filter((sample) => sample.hits > 0).length;
  const totalInjections = samples.reduce((sum, sample) => sum + sample.injected, 0);
  return {
    samples: turns,
    hitRatePct: Math.round((hitTurns / turns) * 100),
    avgInjections: Math.round((totalInjections / turns) * 10) / 10,
  };
}

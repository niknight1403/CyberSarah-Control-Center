/**
 * Sprint 94 — Langzeit-Gedächtnis des Master-Agenten: reine, deterministische
 * Logik fuer Verdichtung, Retrieval und Prompt-Injektion von Learnings.
 *
 * Das Gedächtnis kombiniert zwei Ebenen:
 *   - Kurzzeitgedächtnis: aktiver Prompt-Kontext (chatMessages pro Session,
 *     siehe server/db.ts) — bereits vorhanden.
 *   - Langzeitgedächtnis: verdichtete Learnings aus vergangenen Turns
 *     (Build-Optimierungen, Fehlerbehebungen, Interaktions- und
 *     Entscheidungswissen), die gegen den aktuellen Prompt gerankt und als
 *     kompaktes Snippet in den System-Prompt injiziert werden.
 *
 * Dieses Modul entscheidet rein:
 *   - welche Art ein Learning hat (build-optimierung / fehlerbehebung / …)
 *   - welche Schluesselwoerter ein Learning represäentieren
 *   - wie relevant ein Learning fuer den aktuellen Prompt ist
 *   - wie die Top-Learnings als Kontext formatiert werden
 */

/* ==================== Lerning-Arten ==================== */

export const AGENT_LEARNING_KINDS = ["build-optimierung", "fehlerbehebung", "interaktion", "entscheidung"] as const;

export type AgentLearningKind = (typeof AGENT_LEARNING_KINDS)[number];

export function isAgentLearningKind(value: string): value is AgentLearningKind {
  return (AGENT_LEARNING_KINDS as readonly string[]).includes(value);
}

const KIND_KEYWORDS: Record<Exclude<AgentLearningKind, "interaktion">, string[]> = {
  "build-optimierung": ["optimier", "performance", "build", "bundle", "lazy", "cache", "pipeline", "deploy", "refactor", "sprint"],
  fehlerbehebung: ["fix", "beheb", "fehler", "error", "bug", "kaputt", "blockier", "crash", " regression", "reparier"],
  entscheidung: ["entscheid", "konvention", "beschlossen", "festgelegt", "architektur-entscheidung", "richtlinie"],
};

/**
 * Klassifiziert die Art eines Learnings aus Titel + Detail.
 * Fehlerbehebung schlaegt Build-Optimierung (ein "Fix der Build-Pipeline"
 * ist primaer eine Fehlerbehebung); Interaktion ist der Fallback.
 */
export function classifyLearningKind(title: string, detail: string): AgentLearningKind {
  const haystack = `${title} ${detail}`.toLowerCase();
  for (const kind of ["fehlerbehebung", "build-optimierung", "entscheidung"] as const) {
    if (KIND_KEYWORDS[kind].some((keyword) => haystack.includes(keyword))) {
      return kind;
    }
  }
  return "interaktion";
}

/* ==================== Schluesselwoerter ==================== */

/** Deutsche/englische Stopwoerter, die keine Relevanz tragen. */
const STOPWORDS = new Set([
  "und", "oder", "der", "die", "das", "den", "dem", "ein", "eine", "einer", "eines", "ist", "sind", "war", "fuer",
  "mit", "von", "vom", "auf", "aus", "bei", "nicht", "auch", "als", "wie", "kann", "muss", "soll", "hat", "haben",
  "the", "and", "for", "with", "from", "this", "that", "was", "are", "can", "has", "have", "into", "should",
]);

/** Maximale Anzahl Schluesselwoerter je Learning (Prompt-Budget). */
export const MAX_LEARNING_KEYWORDS = 8;

/**
 * Extrahiert signifikante Schluesselwoerter aus einem Text: kleingeschrieben,
 * nur alphanumerisch-plus-mind. 4 Zeichen (fuer echte Begriffe wie "stripe",
 * "apk", "sdk"), Stopwoerter gefiltert, dedupliziert, gekappt.
 */
export function extractLearningKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9äöüß.+_-]+/i)
    .map((word) => word.replace(/^[.+_-]+|[.+_-]+$/g, ""))
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, MAX_LEARNING_KEYWORDS);
}

/* ==================== Learning-Record ==================== */

export type LearningRecordInput = {
  title: string;
  detail: string;
  kind?: AgentLearningKind;
  keywords?: string[];
  sessionId?: string;
};

export type LearningRecord = {
  kind: AgentLearningKind;
  title: string;
  detail: string;
  keywords: string;
  sessionId: string;
};

/** Maximale Feldlaengen — Guards gegen ueberlange Modell-Ausgaben. */
export const MAX_LEARNING_TITLE_CHARS = 160;
export const MAX_LEARNING_DETAIL_CHARS = 900;

/**
 * Baut ein normalisiertes, valide Learning-Record: Titel/Detail gekappt,
 * Art klassifiziert (explizite Angabe gewinnt), Schluesselwoerter aus
 * Titel + Detail extrahiert und mit expliziten Keywords vereint.
 */
export function buildLearningRecord(input: LearningRecordInput): LearningRecord {
  const title = input.title.trim().slice(0, MAX_LEARNING_TITLE_CHARS);
  const detail = input.detail.trim().slice(0, MAX_LEARNING_DETAIL_CHARS);
  const kind = input.kind && isAgentLearningKind(input.kind) ? input.kind : classifyLearningKind(title, detail);
  const keywords = [
    ...new Set([...extractLearningKeywords(`${title} ${detail}`), ...(input.keywords ?? []).map((word) => word.toLowerCase())]),
  ]
    .filter((word) => word.length >= 2)
    .slice(0, MAX_LEARNING_KEYWORDS);
  return {
    kind,
    title,
    detail,
    keywords: keywords.join(","),
    sessionId: input.sessionId ?? "",
  };
}

/* ==================== Retrieval (Relevanz-Ranking) ==================== */

export type RankedLearning = {
  kind: string;
  title: string;
  detail: string;
  keywords: string;
  createdAt: string;
};

/** Mindest-Relevanz, damit ein Learning den System-Prompt belegt. */
export const MIN_LEARNING_RELEVANCE = 2;

/** Maximale Learnings im System-Prompt (Prompt-Budget). */
export const MAX_PROMPT_LEARNINGS = 3;

/**
 * Relevanz-Score eines Learnings fuer einen Prompt: +2 je trefferfreiem
 * Schluesselwort (doppelte Treffer zaehlen nur einfach), +1 Bonus fuer
 * Fehlerbehebungs-Learnings (die rueckplaedigsten Praxis-Erfahrungen).
 */
export function learningRelevanceScore(learning: RankedLearning, prompt: string): number {
  const promptKeywords = new Set(extractLearningKeywords(prompt));
  const promptLower = prompt.toLowerCase();
  const learningKeywords = learning.keywords
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const hits = learningKeywords.filter((keyword) => {
    for (const promptKeyword of promptKeywords) {
      if (promptKeyword.includes(keyword) || keyword.includes(promptKeyword)) return true;
    }
    // Kurz-Begriffe (npm, ci, apk, aab) fallen durch die 4-Zeichen-Schwelle
    // der Keyword-Extraktion — deshalb zustazlich direkter Textabgleich.
    return keyword.length >= 3 && promptLower.includes(keyword);
  }).length;
  const kindBonus = learning.kind === "fehlerbehebung" ? 1 : 0;
  return hits * 2 + kindBonus;
}

/**
 * Waehlt die relevantesten Learnings fuer einen Prompt — nur Treffer
 * ueber der Mindest-Relevanz, nach Score absteigend, nach Alter stabil.
 */
export function selectRelevantLearnings<T extends RankedLearning>(learnings: T[], prompt: string, limit = MAX_PROMPT_LEARNINGS): T[] {
  return learnings
    .map((learning) => ({ learning, score: learningRelevanceScore(learning, prompt) }))
    .filter((entry) => entry.score >= MIN_LEARNING_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.learning);
}

/** True, wenn der Agent-Turn Werkzeuge nutzte, die ein Auto-Learning verdienen. */
const LEARNING_TRIGGER_TOOLS = new Set(["write_repo_file", "commit_changes", "push_changes"]);

export function turnDeservesLearning(toolNames: string[]): boolean {
  return toolNames.some((name) => LEARNING_TRIGGER_TOOLS.has(name));
}

/**
 * Leitet Titel und Detail eines Auto-Learnings aus dem Turn ab:
 * Nutzeranfrage als Kontext, Assistenten-Zusammenfassung als Detail.
 */
export function deriveLearningFromTurn(userMessage: string, assistantSummary: string, toolsUsed: string[]): LearningRecordInput {
  const title = userMessage.replace(/\s+/g, " ").trim().slice(0, 120) || "Agent-Turn mit Werkzeugnutzung";
  const toolLine = toolsUsed.length > 0 ? ` Werkzeuge: ${toolsUsed.join(", ")}.` : "";
  return {
    title,
    detail: `${assistantSummary.replace(/\s+/g, " ").trim()}${toolLine}`.trim(),
  };
}

/* ==================== Prompt-Injektion ==================== */

/**
 * Formatiert die Top-Learnings als kompaktes Kontext-Snippet fuer den
 * System-Prompt. Leer bei irrelevanter Geschichte — der Prompt bleibt sauber.
 */
export function formatLearningsForContext(learnings: RankedLearning[]): string {
  if (learnings.length === 0) return "";
  const lines = learnings.map((learning) => `- [${learning.kind}] ${learning.title}: ${learning.detail.slice(0, 240)}`);
  return `\n\nLangzeit-Gedächtnis (relevante Erfahrungen aus frueheren Arbeiten):\n${lines.join("\n")}`;
}

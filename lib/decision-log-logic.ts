/**
 * Sprint 252 — Entscheidungs-Journal: Kern-Domäne (rein, testbar).
 *
 * Eine Entscheidung ist eine Wette auf die Zukunft. Ehrlichkeits-Regeln:
 *   - Jede Entscheidung wird mit ihrer **Erwartung** festgehalten — als
 *     prüfbare Aussage, nicht als Stimmung ("bringt was" prüft nichts).
 *   - Nachprüfen heißt vergleichen, nicht rechtfertigen: eine Erwartung,
 *     die nicht eintrat, ist ein Ergebnis, kein Vorwurf.
 *   - Nichts wird nachträglich umgeschrieben: korrigierte Entscheidungen
 *     bleiben als Verlauf sichtbar (superseded, nie überschrieben).
 */

export const DECISION_LIMITS = {
  title: { min: 5, max: 160 },
  context: { min: 0, max: 600 },
  expectation: { min: 10, max: 400 },
  maxOpen: 40,
} as const;

export const DECISION_DISCLAIMER =
  "Das Entscheidungs-Journal hält Entscheidungen mit ihrer Erwartung fest und prüft sie später ehrlich nach: Anlegen, Nachprüfen und Ersetzen passieren ausschließlich nach deiner Bestätigung, nichts wird rückwirkend geschönt.";

export type DecisionStatus = "open" | "confirmed" | "unclear" | "wrong" | "superseded";

export type DecisionItem = {
  id: string;
  title: string;
  /** Was damals relevant war — darf unordentlich sein, darf nicht fehlen. */
  context: string;
  /** Die prüfbare Erwartung: was, bis wann, wie messbar. */
  expectation: string;
  status: DecisionStatus;
  decidedAt: number;
  /** Spätester ehrlicher Nachprüf-Zeitpunkt (ISO-Tag). */
  reviewBy: string;
  updatedAt: number;
  /** Ergebnis der Nachprüfung — nur gesetzt, wenn tatsächlich geprüft wurde. */
  reviewNote: string | null;
};

export type DecisionValidation = { valid: true } | { valid: false; reason: string };

export function decisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case "open": return "offen";
    case "confirmed": return "Erwartung bestätigt";
    case "unclear": return "unklar";
    case "wrong": return "Erwartung nicht eingetroffen";
    case "superseded": return "ersetzt";
  }
}

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isoDayFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function validateDecisionItem(input: Partial<DecisionItem>): DecisionValidation {
  const title = (input.title ?? "").trim();
  if (title.length < DECISION_LIMITS.title.min || title.length > DECISION_LIMITS.title.max) {
    return { valid: false, reason: `Der Titel braucht ${DECISION_LIMITS.title.min}–${DECISION_LIMITS.title.max} Zeichen — "höherer Umsatz" ist keine Entscheidung, "Preis um 20% erhöht" schon.` };
  }
  const context = input.context ?? "";
  if (context.length > DECISION_LIMITS.context.max) {
    return { valid: false, reason: `Der Kontext ist zu lang (max. ${DECISION_LIMITS.context.max} Zeichen).` };
  }
  const expectation = (input.expectation ?? "").trim();
  if (expectation.length < DECISION_LIMITS.expectation.min || expectation.length > DECISION_LIMITS.expectation.max) {
    return { valid: false, reason: `Die Erwartung braucht ${DECISION_LIMITS.expectation.min}–${DECISION_LIMITS.expectation.max} Zeichen als prüfbare Aussage — "bringt was" ist nicht prüfbar.` };
  }
  if (typeof input.reviewBy !== "string" || !isIsoDay(input.reviewBy)) {
    return { valid: false, reason: "Es fehlt ein prüfbarer Nachprüf-Tag (ISO, z. B. 2026-10-01) — ohne Termin wird aus Nachprüfen nie Prüfen." };
  }
  if (input.status !== undefined && !["open", "confirmed", "unclear", "wrong", "superseded"].includes(input.status)) {
    return { valid: false, reason: "Unbekannter Entscheidungs-Status." };
  }
  return { valid: true };
}

/** Zählt nur offene, noch nicht nachgeprüfte Entscheidungen. */
export function countOpenDecisions(items: DecisionItem[]): number {
  return items.filter((item) => item.status === "open").length;
}

let decisionIdCounter = 0;

/** Erstellt eine normalisierte Entscheidung; wirft bei invalider Eingabe. */
export function createDecisionItem(input: Partial<DecisionItem>, now = Date.now): DecisionItem {
  const validation = validateDecisionItem(input);
  if (!validation.valid) throw new Error(validation.reason);
  const timestamp = now();
  decisionIdCounter += 1;
  return {
    id: `decision-${timestamp.toString(36)}-${decisionIdCounter}`,
    title: input.title!.trim(),
    context: (input.context ?? "").trim(),
    expectation: input.expectation!.trim(),
    status: input.status ?? "open",
    decidedAt: timestamp,
    reviewBy: input.reviewBy!,
    updatedAt: timestamp,
    reviewNote: null,
  };
}

/** Überfällige Nachprüfungen als ehrliche Beobachtung — kein Mahnton. */
export function findDueForReview(items: DecisionItem[], now = Date.now): DecisionItem[] {
  const today = isoDayFromTimestamp(now());
  return items.filter((item) => item.status === "open" && item.reviewBy <= today);
}

export function hasOpenCapacity(items: DecisionItem[]): boolean {
  return countOpenDecisions(items) < DECISION_LIMITS.maxOpen;
}

/* ==================== Nachprüfungs-Verdikt (Sprint 253) ==================== */

export type ReviewVerdict = {
  status: DecisionStatus;
  /** Warum dieses Verdikt — nachvollziehbar, ohne Rechtfertigungs-Druck. */
  rationale: string;
};

/**
 * Bewertet eine Nachprüfung ehrlich: Die Erwartung wurde beim Festhalten
 * als prüfbare Aussage formuliert. Beim Nachprüfen zählt nur der Vergleich.
 *   - bestätigt: Die Aussage ist eingetroffen.
 *   - nicht eingetroffen: Die Aussage ist nicht eingetroffen — ein Ergebnis,
 *     kein Vorwurf, und die Entscheidung wird trotzdem nicht rückwirkend
 *     dumm. Unsicherheit war beim Treffen erlaubt.
 *   - unklar: Der Nutzer kann oder will nicht eindeutig messen — das wird
 *     dokumentiert statt zur Zahl geschönt.
 */
export function buildReviewVerdict(
  decision: DecisionItem,
  outcomeReport: string,
  now = Date.now,
): ReviewVerdict {
  const trimmed = outcomeReport.trim();
  const today = isoDayFromTimestamp(now());
  if (trimmed.length < 5) {
    return { status: "unclear", rationale: "Kein Ergebnis berichtet — unklar dokumentieren ist ehrlicher als ein Verdikt aus Stille." };
  }
  // Explizite Unsicherheit geht vor: "schwer zu sagen" ist eine Aussage
  // über die Messbarkeit, nicht über das Ergebnis.
  const uncertain = /(schwer zu sagen|unklar|weiß nicht|nicht sicher|gemischt|mal besser, mal schlechter|kaum messbar)/i.test(trimmed);
  if (uncertain) {
    return { status: "unclear", rationale: `Bericht nennt die Messbarkeit selbst unklar — am ${today} als unklar dokumentiert, nicht geraten.` };
  }
  // Der Nutzer benennt das Ergebnis selbst; wir ordnen nur ehrlich ein.
  const negative = /\b(nicht|kein\w*|weniger|gescheitert|schlechter|gefallen|abgesagt|verfehlt|verpasst)\b/i.test(trimmed);
  const positive = /\b(bestätigt|eingetroffen|gestiegen|gewachsen|erreicht|geklappt|gelungen|erfüllt|plus)\b/i.test(trimmed);
  if (positive && !negative) {
    return { status: "confirmed", rationale: `Erwartung eingetroffen — dokumentiert am ${today}. Der Eintrag bleibt unverändert lesbar.` };
  }
  if (negative && !positive) {
    return { status: "wrong", rationale: `Erwartung nicht eingetroffen — dokumentiert am ${today}. Ein Ergebnis, kein Vorwurf: die Entscheidung durfte unsicher sein, das Journal darf lügen nicht.` };
  }
  return {
    status: "unclear",
    rationale: `Bericht enthält beides oder keines eindeutig — am ${today} als unklar dokumentiert, nicht geraten.`,
  };
}

/** Wendet ein Nachprüfungs-Verdikt an — nur nach Nutzer-Bestätigung aufrufbar. */
export function applyReviewVerdict(decision: DecisionItem, verdict: ReviewVerdict, outcomeReport: string, now = Date.now): DecisionItem {
  const timestamp = now();
  return {
    ...decision,
    status: verdict.status,
    reviewNote: outcomeReport.trim(),
    updatedAt: timestamp,
  };
}

/* ==================== Ersetzen als Verlauf (Sprint 254) ==================== */

export type SupersedeOutcome =
  | { ok: true; items: DecisionItem[]; supersededId: string; successorId: string; note: string }
  | { ok: false; reason: string };

/**
 * Ersetzt eine Entscheidung durch eine Nachfolgerin — ohne die Historie zu
 * überschreiben: die alte bleibt mit Status "ersetzt" lesbar, die neue
 * referenziert nichts Heimliches. Rückwirkendes Schönen ist ausgeschlossen,
 * weil die alte Formulierung unangetastet bleibt.
 */
export function supersedeDecision(
  items: DecisionItem[],
  targetId: string,
  successorInput: Partial<DecisionItem>,
  now = Date.now,
): SupersedeOutcome {
  const target = items.find((item) => item.id === targetId);
  if (!target) return { ok: false, reason: "Keine Entscheidung mit dieser ID — Ersetzen braucht ein eindeutiges Ziel." };
  if (target.status === "superseded") return { ok: false, reason: "Diese Entscheidung ist bereits ersetzt — doppelt Ersetzen wäre Verlaufslüge." };

  const validation = validateDecisionItem(successorInput);
  if (!validation.valid) return { ok: false, reason: validation.reason };

  const successor = createDecisionItem(successorInput, now);
  const timestamp = now();
  const updatedTarget: DecisionItem = {
    ...target,
    status: "superseded",
    reviewNote: `Ersetzt am ${isoDayFromTimestamp(timestamp)} durch "${successor.title}" — die ursprüngliche Erwartung steht weiterhin hier, unverändert.`,
    updatedAt: timestamp,
  };
  const updated: DecisionItem[] = [...items];
  const index = updated.findIndex((item) => item.id === targetId);
  updated[index] = updatedTarget;
  return {
    ok: true,
    items: [...updated, successor],
    supersededId: updatedTarget.id,
    successorId: successor.id,
    note: `"${target.title}" bleibt als ersetzt lesbar; "${successor.title}" ist die aktive Nachfolgerin.`,
  };
}

/** Verlauf einer Entscheidung: jede Ersetzung bleibt als Kette sichtbar. */
export function describeSupersedeChain(items: DecisionItem[], decisionId: string): string[] {
  const chain: string[] = [];
  let current = items.find((item) => item.id === decisionId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(`${decisionStatusLabel(current.status)}: "${current.title}" (entschieden ${isoDayFromTimestamp(current.decidedAt)})`);
    const match = current.reviewNote?.match(/durch "(.+?)" —/);
    current = match ? items.find((item) => item.title === match[1]) : undefined;
  }
  // Chronologisch vom Ursprung zur Nachfolgerin — der älteste Eintrag zuerst.
  return chain;
}

/* ==================== Prompt-Parsing (Sprint 255) ==================== */

export type DecisionPromptAction = "add" | "review" | "supersede" | "status" | "list";

export type DecisionPromptCommand = {
  actions: DecisionPromptAction[];
  titleQuery: string | null;
  newDecision: { title: string; context: string | null; expectation: string; reviewBy: string | null } | null;
  /** Bericht für eine Nachprüfung — null, wenn keiner erkannt. */
  outcomeReport: string | null;
};

/** Parst deutsche Entscheidungs-Aufträge. Verneinte Aufträge bleiben Anfragen. */
export function parseDecisionPrompt(prompt: string, now = Date.now): DecisionPromptCommand {
  const trimmed = prompt.trim();
  if (!trimmed) return { actions: ["list"], titleQuery: null, newDecision: null, outcomeReport: null };

  const negated = /(nicht|nichts|kein\w*)\s+(nachprüf|prüf\w*|ersetz\w*|ändern|änderst)/i.test(trimmed);
  if (negated) return { actions: ["status"], titleQuery: extractDecisionTitleQuery(trimmed), newDecision: null, outcomeReport: null };

  const actions: DecisionPromptAction[] = [];
  if (/\b(entscheid\w*|beschloss\w*|festgehal\w*|notier|notiere|hinzufü)/i.test(trimmed)) actions.push("add");
  if (/\b(nachprüf|prüf\w*\s+nach|ergebnis|bericht)/i.test(trimmed)) actions.push("review");
  if (/\b(ersetz\w*|korrigier\w*|überarbeit\w*)/.test(trimmed) && /\bersetz/i.test(trimmed)) actions.push("supersede");
  if (/\b(status|stand|fällig|überfällig)/i.test(trimmed)) actions.push("status");
  if (/\b(liste|übersicht|alle|zeig|journal)/i.test(trimmed)) actions.push("list");
  if (actions.length === 0) actions.push("status");

  const newDecision = actions.includes("add") ? extractNewDecision(trimmed) : null;
  const outcomeReport = actions.includes("review") ? extractOutcomeReport(trimmed) : null;
  return { actions, titleQuery: extractDecisionTitleQuery(trimmed), newDecision, outcomeReport };
}

function extractDecisionTitleQuery(prompt: string): string | null {
  const quoted = prompt.match(/["'„]([^"'„]{3,})["'„]/);
  if (quoted?.[1]) return quoted[1].trim();
  const colon = prompt.match(/\b(?:für|von)\s+(?:die\s+Entscheidung\s+)?([\w\- /!?:.,&+]+)/i);
  return colon?.[1]?.trim() || null;
}

function extractNewDecision(prompt: string): { title: string; context: string | null; expectation: string; reviewBy: string | null } | null {
  const colon = prompt.match(/(?:Entscheidung|Beschluss)\s*:([^;\n]+)/i);
  const title = colon?.[1]?.trim();
  const expectationMatch = prompt.match(/Erwartung\s*:([^;\n]+)/i);
  const expectation = expectationMatch?.[1]?.trim();
  if (!title || !expectation) return null;
  const contextMatch = prompt.match(/Kontext\s*:([^;\n]+)/i);
  const reviewMatch = prompt.match(/(?:Nachprüf\w*|Prüftermin)\s*:([^;\n]+)/i);
  const reviewBy = reviewMatch?.[1]?.trim() ?? null;
  return { title, context: contextMatch?.[1]?.trim() ?? null, expectation, reviewBy };
}

function extractOutcomeReport(prompt: string): string | null {
  const report = prompt.match(/(?:Ergebnis|Bericht)\s*:([^;\n]+)/i);
  return report?.[1]?.trim() ?? null;
}

/* ==================== Ehrliches Prompt-Ergebnis (Sprint 256) ==================== */

export type DecisionResult = {
  headline: string;
  lines: string[];
  disclaimer: string;
};

/** Findet Entscheidungen per Titel-Anteil (case-insensitive) — nie per ID-Raten. */
export function findDecisionByTitle(items: DecisionItem[], query: string): DecisionItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 3) return [];
  return items.filter((item) => item.title.toLowerCase().includes(needle));
}

/**
 * Baut die ehrliche Antwort auf ein Entscheidungs-Kommando: Auskunft sofort,
 * Nachprüfen/Ersetzen nur als Freigabe-Anfrage formuliert.
 */
export function buildDecisionResult(command: DecisionPromptCommand, items: DecisionItem[], now = Date.now): DecisionResult {
  const lines: string[] = [];
  const targets = command.titleQuery ? findDecisionByTitle(items, command.titleQuery) : [];

  if (command.actions.includes("add")) {
    if (!command.newDecision) {
      lines.push('Keine Entscheidung erkannt — z. B. "Entscheidung: <Titel>; Erwartung: <prüfbare Aussage>; Nachprüfen: <ISO-Tag>".');
    } else if (!hasOpenCapacity(items)) {
      lines.push(`Journal voll: max. ${DECISION_LIMITS.maxOpen} offene Entscheidungen — erst nachprüfen oder ersetzen, dann festhalten.`);
    } else {
      const reviewBy = command.newDecision.reviewBy && isIsoDay(command.newDecision.reviewBy) ? command.newDecision.reviewBy : null;
      if (!reviewBy) {
        lines.push('Die Entscheidung braucht einen prüfbaren Nachprüf-Tag (ISO, z. B. 2026-12-31) — ohne Termin wird aus Nachprüfen nie Prüfen.');
      } else {
        lines.push(`Entscheidung vorbereitet: "${command.newDecision.title}" mit Erwartung "${command.newDecision.expectation}", Nachprüfen bis ${reviewBy} — festgehalten wird erst nach deiner Bestätigung.`);
      }
    }
  }

  if (command.actions.includes("list") || command.actions.includes("status")) {
    const open = items.filter((item) => item.status === "open");
    const due = findDueForReview(items, now);
    if (items.length === 0) {
      lines.push("Keine Entscheidungen im Journal — leerer Zustand, kein Fehler.");
    } else if (open.length === 0) {
      lines.push(`${items.length} Entscheidung(en) gespeichert, keine offen — alles nachgeprüft oder ersetzt.`);
    } else {
      lines.push(`${open.length} offene Entscheidung(en), davon ${due.length} zur Nachprüfung fällig.`);
    }
    if (due.length > 0) {
      lines.push(`Fällig: ${due.slice(0, 4).map((item) => `"${item.title}" (seit ${item.reviewBy})`).join(", ")}${due.length > 4 ? " …" : ""} — fällig heißt gesehen werden, nicht verurteilt werden.`);
    }
  }

  if (command.titleQuery && targets.length === 0 && !command.actions.includes("add")) {
    lines.push(`Keine Entscheidung passt zu "${command.titleQuery}" — bitte den Titel prüfen.`);
  }
  if (targets.length > 1) {
    lines.push(`Uneindeutig: ${targets.length} Entscheidungen passen (${targets.map((item) => item.title).slice(0, 4).join(", ")}) — bitte genauer benennen.`);
  }

  if (targets.length === 1) {
    const target = targets[0]!;
    const statusLine = `Entscheidung "${target.title}": ${decisionStatusLabel(target.status)}, entschieden am ${isoDayFromTimestamp(target.decidedAt)}, Nachprüfen bis ${target.reviewBy}.`;
    if (command.actions.includes("review")) {
      if (target.status !== "open") {
        lines.push(`${statusLine} Bereits ${target.status === "superseded" ? "ersetzt" : "nachgeprüft"} — die Nachprüfung von ${isoDayFromTimestamp(target.updatedAt)} bleibt stehen, doppelt Prüfen wäre Schönung.`);
      } else if (!command.outcomeReport) {
        lines.push(`${statusLine} Nachprüfung vorbereitet — bitte das Ergebnis berichten (z. B. "Ergebnis: <Beobachtung>").`);
      } else {
        const verdict = buildReviewVerdict(target, command.outcomeReport, now);
        lines.push(`${statusLine} Nachprüfung vorbereitet als "${decisionStatusLabel(verdict.status)}" — eingetragen wird erst nach deiner Bestätigung.`);
      }
    } else if (command.actions.includes("supersede")) {
      lines.push(`${statusLine} Ersetzen vorbereitet — die alte Formulierung bleibt unverändert lesbar, erst nach deiner Bestätigung.`);
    } else if (!command.actions.includes("list") && !command.actions.includes("status")) {
      lines.push(statusLine);
      lines.push(`• Erwartung damals: "${target.expectation}"`);
    }
  }

  if (lines.length === 0) lines.push('Alles im Plan — z. B. "Zeig das Journal" oder "Was ist zur Nachprüfung fällig?".');
  const headline = command.actions.includes("review")
    ? "Nachprüfung"
    : command.actions.includes("supersede")
      ? "Entscheidung ersetzen"
      : command.actions.includes("add")
        ? "Neue Entscheidung"
        : targets.length === 1
          ? `Entscheidung: ${targets[0]!.title}`
          : "Entscheidungs-Journal";
  return { headline, lines, disclaimer: DECISION_DISCLAIMER };
}

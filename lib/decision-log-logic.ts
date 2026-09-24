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

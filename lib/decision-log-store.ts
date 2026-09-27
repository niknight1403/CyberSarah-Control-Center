/**
 * Sprint 257 — Persistenz des Entscheidungs-Journals (I/O, injizierbar).
 *
 * Gleiche Ehrlichkeits-Regeln wie Fokus-, Loop- und Ideen-Store:
 *   - Korrupte Daten werden gemeldet und verworfen, nie still ersetzt.
 *   - Die Liste ist begrenzt; nachgeprüfte und ersetzte Entscheidungen sind
 *     Verlauf und dürfen bei Platznot zuerst aus der lokalen Historie
 *     fallen — offene Entscheidungen zuletzt.
 *   - Die Verlaufstreue beim Ersetzen bleibt unangetastet: Geladenes wird
 *     nie uminterpretiert.
 */

import { validateDecisionItem, type DecisionItem } from "@/lib/decision-log-logic";

export const DECISION_STORAGE_ID = "cybersarah.decision-log.v1";
export const MAX_STORED_DECISIONS = 250;

export type DecisionKeyValueAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StoredEnvelope = {
  version: 1;
  savedAt: number;
  items: DecisionItem[];
};

function assertValidStoredDecision(entry: unknown, index: number): DecisionItem {
  if (typeof entry !== "object" || entry === null) throw new Error(`Entscheidung ${index} ist kein Objekt.`);
  const decision = entry as Partial<DecisionItem>;
  const validation = validateDecisionItem({ title: decision.title, context: decision.context, expectation: decision.expectation, reviewBy: decision.reviewBy, status: decision.status });
  if (!validation.valid) throw new Error(`Entscheidung ${index} ist unvollständig: ${validation.reason}`);
  if (typeof decision.id !== "string" || typeof decision.decidedAt !== "number" || typeof decision.updatedAt !== "number") {
    throw new Error(`Entscheidung ${index} hat ungültige Verwaltungsdaten.`);
  }
  if (decision.reviewNote !== null && typeof decision.reviewNote !== "string") {
    throw new Error(`Entscheidung ${index} hat einen ungültigen Nachprüf-Vermerk.`);
  }
  return decision as DecisionItem;
}

function pruneToLimit(items: DecisionItem[]): { items: DecisionItem[]; pruned: number } {
  // Opfer-Reihenfolge: entschiedene (nachgeprüfte/ersetzte) zuerst, älteste
  // voran — offene Entscheidungen zuletzt, egal wie alt.
  const sacrifice = (item: DecisionItem): number => (item.status === "open" ? 0 : 1);
  const sorted = [...items].sort((a, b) => sacrifice(b) - sacrifice(a) || a.decidedAt - b.decidedAt);
  const pruned = Math.max(0, sorted.length - MAX_STORED_DECISIONS);
  return { items: pruned === 0 ? items : sorted.slice(pruned), pruned };
}

/** Lädt gespeicherte Entscheidungen; korrupter Speicher wird gemeldet und geleert. */
export async function loadDecisions(adapter: DecisionKeyValueAdapter): Promise<{ items: DecisionItem[]; note: string | null }> {
  let raw: string | null;
  try {
    raw = await adapter.getItem(DECISION_STORAGE_ID);
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht lesbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
  if (raw === null) return { items: [], note: null };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) throw new Error("Ungültiges Speicherformat.");
    const items = parsed.items.map((entry, index) => assertValidStoredDecision(entry, index));
    const limited = pruneToLimit(items);
    return {
      items: limited.items,
      note: limited.pruned > 0 ? `${limited.pruned} entschiedene Entscheidung(en) über dem Limit (${MAX_STORED_DECISIONS}) aus der lokalen Historie entfernt — offene blieben unberührt.` : null,
    };
  } catch (error) {
    await adapter.removeItem(DECISION_STORAGE_ID);
    return {
      items: [],
      note: `Gespeicherte Entscheidungen waren beschädigt (${error instanceof Error ? error.message : "unbekannt"}) und wurden sicher entfernt.`,
    };
  }
}

/** Speichert das Journal begrenzt; Fehler werden weitergegeben. */
export async function saveDecisions(adapter: DecisionKeyValueAdapter, items: DecisionItem[], now = Date.now): Promise<void> {
  const limited = pruneToLimit(items);
  const envelope: StoredEnvelope = { version: 1, savedAt: now(), items: limited.items };
  try {
    await adapter.setItem(DECISION_STORAGE_ID, JSON.stringify(envelope));
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht schreibbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
}

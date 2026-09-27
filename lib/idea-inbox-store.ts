/**
 * Sprint 247 — Persistenz der Ideen-Inbox (I/O, injizierbar).
 *
 * Gleiche Ehrlichkeits-Regeln wie Fokus- und Loop-Store:
 *   - Korrupte Daten werden gemeldet und verworfen, nie still ersetzt.
 *   - Die Gesamtliste ist begrenzt (offene + entschiedene), chronologisch
 *     gekürzt — entschiedene Ideen sind Geschichte und dürfen zuerst fallen.
 */

import { validateIdeaItem, type IdeaItem } from "@/lib/idea-inbox-logic";

export const IDEA_STORAGE_ID = "cybersarah.idea-inbox.v1";
export const MAX_STORED_IDEA_ITEMS = 300;

export type IdeaKeyValueAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StoredEnvelope = {
  version: 1;
  savedAt: number;
  items: IdeaItem[];
};

function assertValidStoredIdea(entry: unknown, index: number): IdeaItem {
  if (typeof entry !== "object" || entry === null) throw new Error(`Idee ${index} ist kein Objekt.`);
  const idea = entry as Partial<IdeaItem>;
  const validation = validateIdeaItem({ title: idea.title, note: idea.note, source: idea.source, status: idea.status });
  if (!validation.valid) throw new Error(`Idee ${index} ist unvollständig: ${validation.reason}`);
  if (typeof idea.id !== "string" || typeof idea.capturedAt !== "number" || typeof idea.updatedAt !== "number") {
    throw new Error(`Idee ${index} hat ungültige Verwaltungsdaten.`);
  }
  return idea as IdeaItem;
}

function pruneToLimit(items: IdeaItem[]): { items: IdeaItem[]; pruned: number } {
  // Offene Ideen zuerst behalten: entschiedene sind abgeschlossene Geschichte
  // und dürfen bei Platznot zuerst aus der lokalen Historie fallen.
  const sacrifice = (item: IdeaItem): number => (item.status === "inbox" ? 0 : 1);
  // Opfer-Reihenfolge: entschiedene zuerst (älteste voran), offene zuletzt.
  const sorted = [...items].sort((a, b) => sacrifice(b) - sacrifice(a) || a.capturedAt - b.capturedAt);
  const pruned = Math.max(0, sorted.length - MAX_STORED_IDEA_ITEMS);
  return { items: pruned === 0 ? items : sorted.slice(pruned), pruned };
}

/** Lädt gespeicherte Ideen; korrupter Speicher wird gemeldet und geleert. */
export async function loadIdeaItems(adapter: IdeaKeyValueAdapter): Promise<{ items: IdeaItem[]; note: string | null }> {
  let raw: string | null;
  try {
    raw = await adapter.getItem(IDEA_STORAGE_ID);
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht lesbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
  if (raw === null) return { items: [], note: null };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) throw new Error("Ungültiges Speicherformat.");
    const items = parsed.items.map((entry, index) => assertValidStoredIdea(entry, index));
    const limited = pruneToLimit(items);
    return {
      items: limited.items,
      note: limited.pruned > 0 ? `${limited.pruned} entschiedene Idee(n) über dem Limit (${MAX_STORED_IDEA_ITEMS}) aus der lokalen Historie entfernt.` : null,
    };
  } catch (error) {
    await adapter.removeItem(IDEA_STORAGE_ID);
    return {
      items: [],
      note: `Gespeicherte Ideen waren beschädigt (${error instanceof Error ? error.message : "unbekannt"}) und wurden sicher entfernt.`,
    };
  }
}

/** Speichert die Liste begrenzt; Fehler werden weitergegeben. */
export async function saveIdeaItems(adapter: IdeaKeyValueAdapter, items: IdeaItem[], now = Date.now): Promise<void> {
  const limited = pruneToLimit(items);
  const envelope: StoredEnvelope = { version: 1, savedAt: now(), items: limited.items };
  try {
    await adapter.setItem(IDEA_STORAGE_ID, JSON.stringify(envelope));
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht schreibbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
}

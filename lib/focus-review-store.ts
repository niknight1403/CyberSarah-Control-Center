/**
 * Sprint 238 — Persistenz der Fokus-Punkte (I/O, injizierbar).
 *
 * Speichert die Nutzer-Punkte lokal (AsyncStorage-Adapter, Tests mit
 * In-Memory-KV). Ehrlichkeits-Regeln wie beim Loop-Store (Sprint 228):
 *   - Korrupte Daten werden gemeldet und verworfen, nie still ersetzt.
 *   - Die Liste ist begrenzt — kein unendliches lokales Wachstum.
 *   - Schreib-/Lesefehler werden weitergegeben, nicht geschluckt.
 */

import { isIsoDay, validateFocusItem, type FocusItem } from "@/lib/focus-review-logic";

export const FOCUS_STORAGE_ID = "cybersarah.focus-review.v1";
export const MAX_STORED_FOCUS_ITEMS = 400;

export type KeyValueAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StoredEnvelope = {
  version: 1;
  savedAt: number;
  items: FocusItem[];
};

function assertValidStoredItem(entry: unknown, index: number): FocusItem {
  if (typeof entry !== "object" || entry === null) throw new Error(`Punkt ${index} ist kein Objekt.`);
  const item = entry as Partial<FocusItem>;
  const validation = validateFocusItem({ day: item.day, title: item.title, note: item.note, status: item.status });
  if (!validation.valid) throw new Error(`Punkt ${index} ist unvollständig: ${validation.reason}`);
  if (typeof item.id !== "string" || typeof item.createdAt !== "number" || typeof item.updatedAt !== "number") {
    throw new Error(`Punkt ${index} hat ungültige Verwaltungsdaten.`);
  }
  return item as FocusItem;
}

function pruneToLimit(items: FocusItem[]): { items: FocusItem[]; pruned: number } {
  // Älteste Punkte zuerst kürzen — erledigte vor offenen opfern ist willkürlich,
  // chronologisch ist ehrlich und nachvollziehbar.
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const pruned = Math.max(0, sorted.length - MAX_STORED_FOCUS_ITEMS);
  const kept = pruned === 0 ? items : sorted.slice(pruned);
  return { items: kept, pruned };
}

/** Lädt gespeicherte Punkte; korrupter Speicher wird ehrlich gemeldet und geleert. */
export async function loadFocusItems(adapter: KeyValueAdapter): Promise<{ items: FocusItem[]; note: string | null }> {
  let raw: string | null;
  try {
    raw = await adapter.getItem(FOCUS_STORAGE_ID);
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht lesbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
  if (raw === null) return { items: [], note: null };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) throw new Error("Ungültiges Speicherformat.");
    const validatedDays = parsed.items.every((item) => isIsoDay((item as Partial<FocusItem>).day ?? ""));
    if (!validatedDays) throw new Error("Punkte mit ungültigen Tagen.");
    const items = parsed.items.map((entry, index) => assertValidStoredItem(entry, index));
    const limited = pruneToLimit(items);
    return {
      items: limited.items,
      note: limited.pruned > 0 ? `${limited.pruned} älteste Punkte über dem Limit (${MAX_STORED_FOCUS_ITEMS}) entfernt.` : null,
    };
  } catch (error) {
    await adapter.removeItem(FOCUS_STORAGE_ID);
    return {
      items: [],
      note: `Gespeicherte Punkte waren beschädigt (${error instanceof Error ? error.message : "unbekannt"}) und wurden sicher entfernt.`,
    };
  }
}

/** Speichert die Liste begrenzt; Validierung schlägt vor dem Schreiben fehl. */
export async function saveFocusItems(adapter: KeyValueAdapter, items: FocusItem[], now = Date.now): Promise<void> {
  const limited = pruneToLimit(items);
  const envelope: StoredEnvelope = { version: 1, savedAt: now(), items: limited.items };
  try {
    await adapter.setItem(FOCUS_STORAGE_ID, JSON.stringify(envelope));
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht schreibbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
}

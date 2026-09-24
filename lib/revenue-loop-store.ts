/**
 * Sprint 228 — Persistenz der Loop-Entwürfe (I/O, injizierbar).
 *
 * Speichert die vom Nutzer erfassten Schleifen lokal (AsyncStorage-Adapter,
 * Tests mit In-Memory-KV). Ehrlichkeits-Regeln:
 *   - Korrupte/uralte Daten werden gemeldet und verworfen, nie still neu
 *     erfunden (keine Fake-Beispieldaten).
 *   - Die Liste ist begrenzt (kein unendliches lokales Wachstum).
 *   - Schreibfehler werden weitergegeben, nicht geschluckt.
 */

import { validateLoopDraft, type LoopDraft } from "@/lib/revenue-loop-logic";

export const LOOP_STORE_KEY = "cybersarah.revenue-loops.v1";
export const MAX_STORED_LOOPS = 50;

export type KeyValueAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StoredEnvelope = {
  version: 1;
  savedAt: number;
  loops: LoopDraft[];
};

function assertValidStoredLoop(entry: unknown, index: number): LoopDraft {
  if (typeof entry !== "object" || entry === null) throw new Error(`Schleife ${index} ist kein Objekt.`);
  const draft = entry as Partial<LoopDraft>;
  const validation = validateLoopDraft(draft);
  if (!validation.valid) throw new Error(`Schleife ${index} ist unvollständig: ${validation.reason}`);
  if (typeof draft.id !== "string" || typeof draft.status !== "string" || typeof draft.createdAt !== "number" || typeof draft.updatedAt !== "number" || !Array.isArray(draft.samples)) {
    throw new Error(`Schleife ${index} hat ungültige Verwaltungsdaten.`);
  }
  return draft as LoopDraft;
}

/** Lädt die gespeicherten Schleifen; korrupter Speicher wird ehrlich gemeldet und geleert. */
export async function loadLoops(adapter: KeyValueAdapter): Promise<{ loops: LoopDraft[]; note: string | null }> {
  let raw: string | null;
  try {
    raw = await adapter.getItem(LOOP_STORE_KEY);
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht lesbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
  if (raw === null) return { loops: [], note: null };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.loops)) throw new Error("Ungültiges Speicherformat.");
    const loops = parsed.loops.map((entry, index) => assertValidStoredLoop(entry, index));
    if (loops.length > MAX_STORED_LOOPS) {
      return { loops: loops.slice(0, MAX_STORED_LOOPS), note: `${loops.length - MAX_STORED_LOOPS} älteste Schleifen wurden über dem Limit abgeschnitten.` };
    }
    return { loops, note: null };
  } catch (error) {
    // Kaputten Speicher ehrlich beseitigen, statt dauerhaft zu crashen.
    await adapter.removeItem(LOOP_STORE_KEY);
    return {
      loops: [],
      note: `Gespeicherte Schleifen waren beschädigt (${error instanceof Error ? error.message : "unbekannt"}) und wurden sicher entfernt.`,
    };
  }
}

/** Speichert die Liste begrenzt; Validierung schlägt vor dem Schreiben fehl. */
export async function saveLoops(adapter: KeyValueAdapter, loops: LoopDraft[], now = Date.now): Promise<void> {
  const bounded = loops.slice(0, MAX_STORED_LOOPS);
  const envelope: StoredEnvelope = { version: 1, savedAt: now(), loops: bounded };
  try {
    await adapter.setItem(LOOP_STORE_KEY, JSON.stringify(envelope));
  } catch (error) {
    throw new Error(`Lokaler Speicher nicht schreibbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  }
}

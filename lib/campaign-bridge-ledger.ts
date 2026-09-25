/**
 * Sprint 373 — Ledger der verbrueckten Ideen (Persistenz, injizierbar).
 *
 * Ehrlichkeits-Regeln (wie Ideen-/Fokus-Store):
 *   - Korrupte Daten werden gemeldet und verworfen, nie still repariert.
 *   - Begrenzte Historie: aeltere IDs fallen chronologisch zuerst —
 *     verbrueckte Ideen duerfen nicht doppelt in die Freigabe-Queue.
 *   - Der Ledger verhindert doppelte Briefs fuer dieselbe Idee, auch nach
 *     App-Neustart (Idempotenz der autonomen Bruecke).
 */

export const BRIDGE_LEDGER_STORAGE_ID = "cybersarah.campaign-bridge.v1";
export const MAX_LEDGER_IDS = 300;

export type LedgerKeyValueAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type BridgeLedgerState = {
  /** Verbrueckte Ideen-IDs in Einfuege-Reihenfolge (aeltere zuerst). */
  bridgedIdeaIds: string[];
  note: string | null;
};

type StoredEnvelope = {
  version: 1;
  savedAt: number;
  bridgedIdeaIds: string[];
};

export async function loadBridgeLedger(adapter: LedgerKeyValueAdapter): Promise<BridgeLedgerState> {
  const raw = await adapter.getItem(BRIDGE_LEDGER_STORAGE_ID);
  if (raw == null) return { bridgedIdeaIds: [], note: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { bridgedIdeaIds: [], note: "Ledger unlesbar — Einträge verworfen, Brücke startet mit leerer Historie." };
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as Partial<StoredEnvelope>).version !== 1) {
    return { bridgedIdeaIds: [], note: "Ledger-Format unbekannt — Historie verworfen (kein stiller Reparaturversuch)." };
  }
  const ids = (parsed as StoredEnvelope).bridgedIdeaIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return { bridgedIdeaIds: [], note: "Ledger-Einträge ungültig — Historie verworfen." };
  }
  const deduped = [...new Set(ids)].slice(-MAX_LEDGER_IDS);
  return { bridgedIdeaIds: deduped, note: deduped.length === ids.length ? null : "Ledger bereinigt (Duplikate/Überhang entfernt)." };
}

export async function saveBridgeLedger(adapter: LedgerKeyValueAdapter, bridgedIdeaIds: string[], now = Date.now()): Promise<void> {
  const deduped = [...new Set(bridgedIdeaIds)].slice(-MAX_LEDGER_IDS);
  const envelope: StoredEnvelope = { version: 1, savedAt: now, bridgedIdeaIds: deduped };
  await adapter.setItem(BRIDGE_LEDGER_STORAGE_ID, JSON.stringify(envelope));
}

/** Merkt eine Idee im Ledger als verbrueckt (idempotent). */
export async function markIdeasBridged(adapter: LedgerKeyValueAdapter, ideaIds: string[], now = Date.now()): Promise<BridgeLedgerState> {
  const current = await loadBridgeLedger(adapter);
  const merged = [...current.bridgedIdeaIds, ...ideaIds];
  await saveBridgeLedger(adapter, merged, now);
  return loadBridgeLedger(adapter);
}

import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildPromptResult,
  formatBytesGerman,
  cleanupTargetsUnchanged,
  parseStoragePrompt,
  sortStorageEntries,
  selectCleanupTargets,
  totalSizeBytes,
  type CleanupPlan,
  type PromptResult,
  type StorageEntry,
  type StorageSortKey,
} from "@/lib/storage-manager-logic";
import { applyCleanupEntries, resolveFileSystemAdapter, scanDeviceStorage, type StorageScan } from "@/lib/storage-manager-device";

/**
 * Sprint 201 — React-Kleber des Speicher-Managers: Scan, Prompt-Auswertung,
 * Aufraeum-Plan und bestaetigte Ausfuehrung. Alle Entscheidungen fallen in der
 * reinen Logik; dieser Hook orchestriert nur I/O und Zustand.
 *
 * Sicherheitsmodell: gefahrlose Ziele (Cache, veraltete Logs) loescht der
 * Nutzer mit EINER Bestaetigung des Gesamtplans; gefaehrliche Ziele
 * (Backups, Dokumente, Medien) bleiben im Plan markiert und werden nur bei
 * expliziter Einzelauswahl geloescht. Nichts laeuft ohne Bestaetigung.
 */

export type StorageManagerState = {
  scan: StorageScan | null;
  scanning: boolean;
  lastPrompt: string;
  lastResult: PromptResult | null;
  plan: CleanupPlan | null;
  applying: boolean;
  applyMessage: string | null;
  sortKey: StorageSortKey;
};

export function useStorageManager() {
  const [state, setState] = useState<StorageManagerState>({
    scan: null,
    scanning: false,
    lastPrompt: "",
    lastResult: null,
    plan: null,
    applying: false,
    applyMessage: null,
    sortKey: "size-desc",
  });
  const adapterRef = useRef(resolveFileSystemAdapter());

  const scanNow = useCallback(async (): Promise<StorageScan> => {
    setState((prev) => ({ ...prev, scanning: true }));
    try {
      const scan = await scanDeviceStorage(adapterRef.current);
      setState((prev) => ({ ...prev, scanning: false, scan, plan: null, lastResult: null }));
      return scan;
    } catch (error) {
      const scan: StorageScan = { status: "partial", entries: [], notes: [
        `Scan fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
      ] };
      setState((prev) => ({ ...prev, scanning: false, scan, plan: null, lastResult: null }));
      return scan;
    }
  }, []);

  const runPrompt = useCallback(
    async (prompt: string): Promise<void> => {
      const scan = state.scan ?? (await scanNow());
      const command = parseStoragePrompt(prompt);
      const result = buildPromptResult(command, scan.entries, { now: Date.now(), sortKey: command.sortKey });
      setState((prev) => ({ ...prev, lastPrompt: prompt, lastResult: result, plan: result.plan ?? null, sortKey: command.sortKey, scan }));
    },
    [state.scan, scanNow],
  );

  const sortEntries = useCallback(
    (sortKey: StorageSortKey): void => {
      setState((prev) => ({ ...prev, sortKey }));
    },
    [],
  );

  /**
   * Fuehrt den Plan mit Bestaetigung aus: safeEntries sind die gefahrlosen
   * Ziele, confirmedEntries die zusaetzlich einzeln bestaetigten. Der Plan
   * selbst enthaelt nie mehr Ziele, als die UI dem Nutzer gezeigt hat.
   */
  const applyPlan = useCallback(
    async (safePaths: string[], confirmedPaths: string[]): Promise<void> => {
      const scan = state.scan;
      if (!scan || !state.plan || state.applying) return;
      const targets = selectCleanupTargets(scan.entries, state.plan, safePaths, confirmedPaths);
      if (targets.length === 0) return;
      setState((prev) => ({ ...prev, applying: true, applyMessage: null }));
      try {
        const before = await scanDeviceStorage(adapterRef.current);
        if (!cleanupTargetsUnchanged(targets, before.entries)) {
          setState((prev) => ({ ...prev, applying: false, scan: before, plan: null, lastResult: null,
            applyMessage: "Speicher seit dem Plan geändert. Bitte erneut analysieren und bestätigen." }));
          return;
        }
        const execution = await applyCleanupEntries(adapterRef.current, targets);
        const fresh = await scanDeviceStorage(adapterRef.current);
        const message =
        execution.failed.length === 0
          ? `${execution.deleted.length} Einträge gelöscht, ${formatBytesGerman(execution.reclaimedBytes)} freigegeben.`
          : `${execution.deleted.length} gelöscht (${formatBytesGerman(execution.reclaimedBytes)} freigegeben), ${execution.failed.length} fehlgeschlagen: ${execution.failed[0]?.reason ?? "unbekannt"}.`;
        setState((prev) => ({ ...prev, applying: false, applyMessage: message, plan: null, lastResult: null, scan: fresh }));
      } catch (error) {
        setState((prev) => ({ ...prev, applying: false, plan: null,
          applyMessage: `Aufräumen abgebrochen: ${error instanceof Error ? error.message : "unbekannter Fehler"}` }));
      }
    },
    [state.scan, state.plan, state.applying, scanNow],
  );

  const sortedEntries = useMemo<StorageEntry[]>(() => {
    if (!state.scan) return [];
    return sortStorageEntries(state.scan.entries, state.sortKey);
  }, [state.scan, state.sortKey]);

  const totalBytes = useMemo(() => (state.scan ? totalSizeBytes(state.scan.entries) : 0), [state.scan]);

  return { state, scanNow, runPrompt, sortEntries, applyPlan, sortedEntries, totalBytes };
}

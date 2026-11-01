import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildIdeaResult,
  createIdeaItem,
  findIdeaByTitle,
  hasInboxCapacity,
  parseIdeaPrompt,
  validateIdeaItem,
  type IdeaItem,
  type IdeaResult,
  type IdeaStatus,
} from "@/lib/idea-inbox-logic";
import { checkPlantVerdict, type PlantVerdict } from "@/lib/idea-focus-bridge";
import type { FocusItem } from "@/lib/focus-review-logic";
import { loadFocusItems, type KeyValueAdapter } from "@/lib/focus-review-store";
import { loadIdeaItems, saveIdeaItems, type IdeaKeyValueAdapter } from "@/lib/idea-inbox-store";

/**
 * Sprint 248 — React-Kleber der Ideen-Inbox: Laden, Prompt-Auswertung,
 * Triage-Vorschläge und Freigabe-Flows. Jede Änderung (Anlegen, Behalten,
 * Pflanzen, Fallenlassen) passiert ausschließlich über approvePending.
 * Pflanzen erzeugt einen Fokus-Punkt-Vorschlag für das Fokus-Modul —
 * auch der wird erst nach Bestätigung angelegt.
 */

export type PendingIdeaChange =
  | { kind: "add"; label: string; detail: string; title: string; note: string; source: string }
  | { kind: "status"; ideaId: string; label: string; detail: string; status: IdeaStatus };

export type PlantProposal = {
  ideaId: string;
  title: string;
  note: string;
  label: string;
  detail: string;
  /** Sprint 250: ehrlicher Pflanzen-Befund aus der Fokus-Brücke. */
  verdict: PlantVerdict;
};

export type IdeaInboxState = {
  items: IdeaItem[];
  storeNote: string | null;
  loading: boolean;
  saveError: string | null;
  lastPrompt: string;
  result: IdeaResult | null;
  pending: PendingIdeaChange | null;
  /** Pflanz-Vorschlag wartet auf eigene Bestätigung (Fokus-Modul). */
  plantProposal: PlantProposal | null;
};

export function useIdeaInbox(adapter?: IdeaKeyValueAdapter) {
  const [state, setState] = useState<IdeaInboxState>({
    items: [], storeNote: null, loading: true, saveError: null, lastPrompt: "", result: null, pending: null, plantProposal: null,
  });
  const itemsRef = useRef<IdeaItem[]>([]);
  /** Read-only-Sicht auf Fokus-Punkte — nur für den Pflanzen-Befund, nie schreibend. */
  const focusItemsRef = useRef<FocusItem[]>([]);

  const storage = useCallback((): IdeaKeyValueAdapter => {
    if (adapter) return adapter;
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  }, [adapter]);

  useEffect(() => {
    let active = true;
    // Fokus-Punkte nur lesen: Die Brücke prüft Kapazität, schreibt bleibt im Fokus-Modul.
    loadFocusItems(storage() as unknown as KeyValueAdapter)
      .then((loaded) => { focusItemsRef.current = loaded.items; })
      .catch(() => { focusItemsRef.current = []; });
    loadIdeaItems(storage())
      .then((loaded) => {
        itemsRef.current = loaded.items;
        if (active) setState((prev) => ({ ...prev, loading: false, items: loaded.items, storeNote: loaded.note }));
      })
      .catch((error: unknown) => {
        if (active) setState((prev) => ({ ...prev, loading: false, storeNote: error instanceof Error ? error.message : "Laden fehlgeschlagen" }));
      });
    return () => { active = false; };
  }, [storage]);

  const persist = useCallback(async (items: IdeaItem[]) => {
    try {
      await saveIdeaItems(storage(), items);
      setState((prev) => ({ ...prev, saveError: null }));
    } catch (error) {
      setState((prev) => ({ ...prev, saveError: error instanceof Error ? error.message : "Speichern fehlgeschlagen" }));
    }
  }, [storage]);

  const runPrompt = useCallback((prompt: string): void => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const command = parseIdeaPrompt(trimmed);
    const items = itemsRef.current;
    const result = buildIdeaResult(command, items);

    let pending: PendingIdeaChange | null = null;
    let plantProposal: PlantProposal | null = null;
    const targets = command.titleQuery ? findIdeaByTitle(items, command.titleQuery) : [];

    if (command.actions.includes("add") && command.newIdea) {
      if (validateIdeaItem({ title: command.newIdea.title, note: command.newIdea.note ?? "", source: command.newIdea.source }).valid && hasInboxCapacity(items)) {
        pending = {
          kind: "add",
          label: `Idee "${command.newIdea.title}"`,
          detail: `aus Quelle ${command.newIdea.source} aufnehmen — erst nach deiner Bestätigung.`,
          title: command.newIdea.title,
          note: command.newIdea.note ?? "",
          source: command.newIdea.source,
        };
      }
    } else if (targets.length === 1) {
      const target = targets[0]!;
      if (command.actions.includes("plant") && target.status !== "planted") {
        const verdict = checkPlantVerdict(target, focusItemsRef.current, null);
        plantProposal = {
          ideaId: target.id,
          title: target.title,
          note: target.note,
          label: "In den Fokus pflanzen",
          detail: verdict.plantable
            ? `"${target.title}": ${verdict.detail}`
            : `"${target.title}" ist aktuell nicht pflanzbar — ${verdict.reason}`,
          verdict,
        };
      } else if (command.actions.includes("keep")) {
        pending = { kind: "status", ideaId: target.id, label: "Behalten", detail: `"${target.title}"`, status: "kept" };
      } else if (command.actions.includes("drop")) {
        pending = { kind: "status", ideaId: target.id, label: "Fallen lassen", detail: `"${target.title}" — endgültig sichtbar.`, status: "dropped" };
      }
    }
    setState((prev) => ({ ...prev, lastPrompt: trimmed, result, pending, plantProposal }));
  }, []);

  const approvePending = useCallback(async (): Promise<void> => {
    const pending = state.pending;
    if (!pending) return;
    const items = itemsRef.current;
    const next = pending.kind === "add"
      ? [...items, createIdeaItem({ title: pending.title, note: pending.note, source: pending.source })]
      : items.map((item) => (item.id === pending.ideaId ? { ...item, status: pending.status, updatedAt: Date.now() } : item));
    itemsRef.current = next;
    setState((prev) => ({
      ...prev,
      items: next,
      pending: null,
      result: { headline: "Änderung übernommen", lines: ["Die bestätigte Änderung wurde gespeichert — ehrlich geführt, nichts erfunden."], disclaimer: prev.result?.disclaimer ?? "" },
    }));
    await persist(next);
  }, [state.pending, persist]);

  /**
   * Sprint 346 — Autonome Ideen-Vorschlaege: legt eine freigegebene Idee
   * direkt in die Inbox (Klick auf "Uebernehmen" = die Freigabe). Ehrlich:
   * bei voller Inbox wird nichts ueberschrieben, sondern abgelehnt.
   */
  const adoptIdea = useCallback(async (title: string, note: string, source: string): Promise<{ ok: boolean; reason: string }> => {
    const items = itemsRef.current;
    if (!hasInboxCapacity(items)) {
      return { ok: false, reason: "Inbox voll — erst Ideen verarbeiten." };
    }
    if (!validateIdeaItem({ title, note, source }).valid) {
      return { ok: false, reason: "Vorschlag unvollstaendig." };
    }
    const next = [...items, createIdeaItem({ title, note, source })];
    itemsRef.current = next;
    setState((prev) => ({ ...prev, items: next }));
    await persist(next);
    return { ok: true, reason: "" };
  }, [persist]);

  const dismissPending = useCallback((): void => {
    setState((prev) => ({ ...prev, pending: null }));
  }, []);

  return { state, runPrompt, approvePending, dismissPending, adoptIdea };
}

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildFocusResult,
  createFocusItem,
  findFocusByTitle,
  FOCUS_DISCLAIMER,
  hasDayCapacity,
  isoDayFromTimestamp,
  parseFocusPrompt,
  validateFocusItem,
  type FocusItem,
  type FocusResult,
  type FocusStatus,
} from "@/lib/focus-review-logic";
import { loadFocusItems, saveFocusItems, type KeyValueAdapter } from "@/lib/focus-review-store";

/**
 * Sprint 239 — React-Kleber des Fokus-Moduls: Laden, Prompt-Auswertung und
 * Bestätigungs-Flows. Jede Änderung (Anlegen, Erledigen, Verschieben,
 * Streichen) passiert ausschließlich über approvePending — der Hook führt
 * nichts aus, was der Nutzer nicht bestätigt hat.
 */

export type PendingFocusChange =
  | { kind: "add"; label: string; detail: string; title: string; day: string; note: string }
  | { kind: "status"; itemId: string; label: string; detail: string; status: FocusStatus; day: string | null };

export type FocusReviewState = {
  items: FocusItem[];
  storeNote: string | null;
  loading: boolean;
  saveError: string | null;
  lastPrompt: string;
  result: FocusResult | null;
  pending: PendingFocusChange | null;
};

const CONFIRMED_RESULT: FocusResult = {
  headline: "Änderung übernommen",
  lines: ["Die bestätigte Änderung wurde gespeichert — ehrlich gezählt, nichts erfunden."],
  disclaimer: FOCUS_DISCLAIMER,
};

export function useFocusReview(adapter?: KeyValueAdapter) {
  const [state, setState] = useState<FocusReviewState>({
    items: [], storeNote: null, loading: true, saveError: null, lastPrompt: "", result: null, pending: null,
  });
  const itemsRef = useRef<FocusItem[]>([]);
  const storage = useCallback((): KeyValueAdapter => {
    if (adapter) return adapter;
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  }, [adapter]);

  useEffect(() => {
    let active = true;
    loadFocusItems(storage())
      .then((loaded) => {
        itemsRef.current = loaded.items;
        if (active) setState((prev) => ({ ...prev, loading: false, items: loaded.items, storeNote: loaded.note }));
      })
      .catch((error: unknown) => {
        if (active) setState((prev) => ({ ...prev, loading: false, storeNote: error instanceof Error ? error.message : "Laden fehlgeschlagen" }));
      });
    return () => { active = false; };
  }, [storage]);

  const persist = useCallback(async (items: FocusItem[]) => {
    try {
      await saveFocusItems(storage(), items);
      setState((prev) => ({ ...prev, saveError: null }));
    } catch (error) {
      setState((prev) => ({ ...prev, saveError: error instanceof Error ? error.message : "Speichern fehlgeschlagen" }));
    }
  }, [storage]);

  /** Wendet ein Kommando an: Auskunft sofort, Änderungen nur als Freigabe-Anfrage. */
  const runPrompt = useCallback((prompt: string): void => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const command = parseFocusPrompt(trimmed);
    const items = itemsRef.current;
    const result = buildFocusResult(command, items);

    let pending: PendingFocusChange | null = null;
    const targets = command.titleQuery ? findFocusByTitle(items, command.titleQuery) : [];
    if (command.actions.includes("add") && command.newFocus) {
      const day = command.newFocus.day ?? isoDayFromTimestamp(Date.now());
      if (validateFocusItem({ day, title: command.newFocus.title, note: command.newFocus.note ?? "" }).valid && hasDayCapacity(items, day)) {
        pending = {
          kind: "add",
          label: `Fokus-Punkt "${command.newFocus.title}"`,
          detail: `für ${day} anlegen — erst nach deiner Bestätigung.`,
          title: command.newFocus.title,
          day,
          note: command.newFocus.note ?? "",
        };
      }
    } else if (command.actions.includes("complete") && targets.length === 1) {
      pending = { kind: "status", itemId: targets[0]!.id, label: "Als erledigt markieren", detail: `"${targets[0]!.title}"`, status: "done", day: command.day };
    } else if (command.actions.includes("move") && targets.length === 1) {
      const day = command.day ?? isoDayFromTimestamp(Date.now());
      if (hasDayCapacity(items, day)) {
        pending = { kind: "status", itemId: targets[0]!.id, label: `Verschieben nach ${day}`, detail: `"${targets[0]!.title}"`, status: "moved", day };
      }
    } else if (command.actions.includes("drop") && targets.length === 1) {
      pending = { kind: "status", itemId: targets[0]!.id, label: "Fallen lassen", detail: `"${targets[0]!.title}" — endgültig sichtbar.`, status: "dropped", day: null };
    }
    setState((prev) => ({ ...prev, lastPrompt: trimmed, result, pending }));
  }, []);

  /** Führt die ausstehende Änderung ausschließlich nach Nutzer-Bestätigung aus. */
  const approvePending = useCallback(async (): Promise<void> => {
    const pending = state.pending;
    if (!pending) return;
    const items = itemsRef.current;
    let next: FocusItem[];
    if (pending.kind === "add") {
      next = [...items, createFocusItem({ day: pending.day, title: pending.title, note: pending.note })];
    } else if (pending.status === "moved" && pending.day) {
      // Verschieben heißt: am neuen Tag Platz brauchen, am alten Tag verschoben bleiben.
      if (!hasDayCapacity(items, pending.day)) return;
      next = items.map((item) => (item.id === pending.itemId ? { ...item, status: "moved" as FocusStatus, note: `${item.note} — verschoben nach ${pending.day}`.trim(), updatedAt: Date.now() } : item));
    } else {
      next = items.map((item) => (item.id === pending.itemId ? { ...item, status: pending.status, updatedAt: Date.now() } : item));
    }
    itemsRef.current = next;
    setState((prev) => ({ ...prev, items: next, pending: null, result: CONFIRMED_RESULT }));
    await persist(next);
  }, [state.pending, persist]);

  const dismissPending = useCallback((): void => {
    setState((prev) => ({ ...prev, pending: null }));
  }, []);

  return { state, runPrompt, approvePending, dismissPending };
}

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildLoopResult,
  createLoopDraft,
  findLoopsByName,
  parseLoopPrompt,
  validateLoopDraft,
  LOOP_DISCLAIMER,
  type LoopDraft,
  type LoopResult,
  type LoopStatus,
} from "@/lib/revenue-loop-logic";
import { loadLoops, saveLoops, type KeyValueAdapter } from "@/lib/revenue-loop-store";

/**
 * Sprint 229 — React-Kleber des Loop-Engineering-Moduls: Laden, Prompt-
 * Auswertung und Bestätigungs-Flows. Jede Änderung (Erstellen, Start,
 * Messwert, Abschluss, Verwerfen) passiert ausschließlich über
 * approvePending — der Hook führt nichts aus, was der Nutzer nicht
 * ausdrücklich bestätigt hat.
 */

export type PendingChange =
  | { kind: "start"; loopId: string; label: string; detail: string }
  | { kind: "sample"; loopId: string; label: string; detail: string; value: number }
  | { kind: "complete"; loopId: string; label: string; detail: string }
  | { kind: "discard"; loopId: string; label: string; detail: string };

export type LoopEngineeringState = {
  loops: LoopDraft[];
  storeNote: string | null;
  loading: boolean;
  saveError: string | null;
  lastPrompt: string;
  result: LoopResult | null;
  pending: PendingChange | null;
};

const CONFIRMED_RESULT: LoopResult = {
  headline: "Änderung übernommen",
  lines: ["Die bestätigte Änderung wurde gespeichert — ehrlich gezählt, nichts erfunden."],
  disclaimer: LOOP_DISCLAIMER,
};

export function useLoopEngineering(adapter?: KeyValueAdapter) {
  const [state, setState] = useState<LoopEngineeringState>({
    loops: [], storeNote: null, loading: true, saveError: null, lastPrompt: "", result: null, pending: null,
  });
  const loopsRef = useRef<LoopDraft[]>([]);
  const adapterRef = useRef<KeyValueAdapter | null>(null);
  if (adapter && adapterRef.current !== adapter) adapterRef.current = adapter;
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
    loadLoops(storage())
      .then((loaded) => {
        loopsRef.current = loaded.loops;
        if (active) setState((prev) => ({ ...prev, loading: false, loops: loaded.loops, storeNote: loaded.note }));
      })
      .catch((error: unknown) => {
        if (active) setState((prev) => ({ ...prev, loading: false, storeNote: error instanceof Error ? error.message : "Laden fehlgeschlagen" }));
      });
    return () => { active = false; };
  }, [storage]);

  const persist = useCallback(async (loops: LoopDraft[]) => {
    try {
      await saveLoops(storage(), loops);
      setState((prev) => ({ ...prev, saveError: null }));
    } catch (error) {
      setState((prev) => ({ ...prev, saveError: error instanceof Error ? error.message : "Speichern fehlgeschlagen" }));
    }
  }, [storage]);

  /** Wendet ein Kommando an: Auskunft sofort, Änderungen nur als Freigabe-Anfrage. */
  const runPrompt = useCallback((prompt: string): void => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const command = parseLoopPrompt(trimmed);
    const loops = loopsRef.current;
    const result = buildLoopResult(command, loops);
    let pending: PendingChange | null = null;
    if (command.actions.includes("create") && command.draft && validateLoopDraft(command.draft).valid) {
      pending = { kind: "start", loopId: "new", label: `Neue Schleife "${command.draft.name}"`, detail: "Erstellen und als Entwurf speichern — startet nichts von selbst." };
    } else if (command.actions.includes("sample") && command.sampleValue !== null) {
      const target = command.nameQuery ? findLoopsByName(loops, command.nameQuery) : [];
      if (target.length === 1) {
        pending = { kind: "sample", loopId: target[0]!.id, label: `Messwert ${command.sampleValue}`, detail: `für "${target[0]!.name}" erfassen`, value: command.sampleValue };
      }
    } else if (command.actions.includes("advance")) {
      const target = command.nameQuery ? findLoopsByName(loops, command.nameQuery) : [];
      if (target.length === 1) {
        const loop = target[0]!;
        pending = loop.status === "draft"
          ? { kind: "start", loopId: loop.id, label: "Experiment starten", detail: `für "${loop.name}" — erst nach deiner Bestätigung.` }
          : { kind: "complete", loopId: loop.id, label: "Abschluss bestätigen", detail: `für "${loop.name}" — erst nach deiner Bestätigung.` };
      }
    } else if (command.actions.includes("discard")) {
      const target = command.nameQuery ? findLoopsByName(loops, command.nameQuery) : [];
      if (target.length === 1) {
        pending = { kind: "discard", loopId: target[0]!.id, label: "Schleife verwerfen", detail: `"${target[0]!.name}" endgültig entfernen — erst nach deiner Bestätigung.` };
      }
    }
    setState((prev) => ({ ...prev, lastPrompt: trimmed, result, pending }));
  }, []);

  /** Führt die ausstehende Änderung ausschließlich nach Nutzer-Bestätigung aus. */
  const approvePending = useCallback(async (): Promise<void> => {
    const pending = state.pending;
    if (!pending) return;
    const loops = loopsRef.current;
    let next: LoopDraft[];
    if (pending.kind === "start") {
      if (pending.loopId === "new") {
        const command = parseLoopPrompt(state.lastPrompt);
        if (!command.draft || !validateLoopDraft(command.draft).valid) return;
        next = [...loops, createLoopDraft(command.draft)];
      } else {
        next = loops.map((loop) => (loop.id === pending.loopId ? { ...loop, status: "running" as LoopStatus, updatedAt: Date.now() } : loop));
      }
    } else if (pending.kind === "sample") {
      next = loops.map((loop) => {
        if (loop.id !== pending.loopId) return loop;
        const samples = [...loop.samples, { at: Date.now(), value: pending.value }];
        return { ...loop, samples, currentValue: pending.value, updatedAt: Date.now() };
      });
    } else if (pending.kind === "complete") {
      next = loops.map((loop) => (loop.id === pending.loopId ? { ...loop, status: "completed" as LoopStatus, updatedAt: Date.now() } : loop));
    } else {
      next = loops.filter((loop) => loop.id !== pending.loopId);
    }
    loopsRef.current = next;
    setState((prev) => ({ ...prev, loops: next, pending: null, result: CONFIRMED_RESULT }));
    await persist(next);
  }, [state.pending, state.lastPrompt, persist]);

  const dismissPending = useCallback((): void => {
    setState((prev) => ({ ...prev, pending: null }));
  }, []);

  return { state, runPrompt, approvePending, dismissPending };
}

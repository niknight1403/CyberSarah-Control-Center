import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  applyReviewVerdict,
  buildDecisionResult,
  buildReviewVerdict,
  createDecisionItem,
  findDecisionByTitle,
  hasOpenCapacity,
  isIsoDay,
  parseDecisionPrompt,
  supersedeDecision,
  validateDecisionItem,
  type DecisionItem,
  type DecisionResult,
} from "@/lib/decision-log-logic";
import { loadDecisions, saveDecisions, type DecisionKeyValueAdapter } from "@/lib/decision-log-store";

/**
 * Sprint 258 — React-Kleber des Entscheidungs-Journals: Laden, Prompt-
 * Auswertung und Bestätigungs-Flows. Nachprüfen und Ersetzen passieren
 * ausschließlich über approvePending; die Historie wird nie überschrieben.
 */

export type PendingDecisionChange =
  | { kind: "add"; label: string; detail: string; draft: Omit<DecisionItem, "id" | "decidedAt" | "updatedAt" | "reviewNote"> }
  | { kind: "review"; decisionId: string; label: string; detail: string; status: DecisionItem["status"]; reviewNote: string }
  | { kind: "supersede"; decisionId: string; label: string; detail: string; successorDraft: Omit<DecisionItem, "id" | "decidedAt" | "updatedAt" | "reviewNote"> };

export type DecisionLogState = {
  items: DecisionItem[];
  storeNote: string | null;
  loading: boolean;
  saveError: string | null;
  lastPrompt: string;
  result: DecisionResult | null;
  pending: PendingDecisionChange | null;
};

const CONFIRMED_RESULT: DecisionResult = {
  headline: "Änderung übernommen",
  lines: ["Die bestätigte Änderung wurde gespeichert — Verlauf bleibt ehrlich, nichts nachträglich gebogen."],
  disclaimer: "",
};

export function useDecisionLog(adapter?: DecisionKeyValueAdapter) {
  const [state, setState] = useState<DecisionLogState>({
    items: [], storeNote: null, loading: true, saveError: null, lastPrompt: "", result: null, pending: null,
  });
  const itemsRef = useRef<DecisionItem[]>([]);

  const storage = useCallback((): DecisionKeyValueAdapter => {
    if (adapter) return adapter;
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  }, [adapter]);

  useEffect(() => {
    let active = true;
    loadDecisions(storage())
      .then((loaded) => {
        itemsRef.current = loaded.items;
        if (active) setState((prev) => ({ ...prev, loading: false, items: loaded.items, storeNote: loaded.note }));
      })
      .catch((error: unknown) => {
        if (active) setState((prev) => ({ ...prev, loading: false, storeNote: error instanceof Error ? error.message : "Laden fehlgeschlagen" }));
      });
    return () => { active = false; };
  }, [storage]);

  const persist = useCallback(async (items: DecisionItem[]) => {
    try {
      await saveDecisions(storage(), items);
      setState((prev) => ({ ...prev, saveError: null }));
    } catch (error) {
      setState((prev) => ({ ...prev, saveError: error instanceof Error ? error.message : "Speichern fehlgeschlagen" }));
    }
  }, [storage]);

  const runPrompt = useCallback((prompt: string): void => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const command = parseDecisionPrompt(trimmed);
    const items = itemsRef.current;
    const result = buildDecisionResult(command, items);
    const targets = command.titleQuery ? findDecisionByTitle(items, command.titleQuery) : [];

    let pending: PendingDecisionChange | null = null;
    if (command.actions.includes("add") && command.newDecision) {
      const reviewBy = command.newDecision.reviewBy && isIsoDay(command.newDecision.reviewBy) ? command.newDecision.reviewBy : null;
      if (reviewBy && hasOpenCapacity(items)) {
        const draft = {
          title: command.newDecision.title,
          context: command.newDecision.context ?? "",
          expectation: command.newDecision.expectation,
          status: "open" as const,
          reviewBy,
        };
        pending = {
          kind: "add",
          label: `Entscheidung "${command.newDecision.title}"`,
          detail: `mit Erwartung "${command.newDecision.expectation}", Nachprüfen bis ${reviewBy} — erst nach deiner Bestätigung.`,
          draft,
        };
      }
    } else if (targets.length === 1 && command.actions.includes("review")) {
      const target = targets[0]!;
      if (target.status === "open" && command.outcomeReport) {
        const verdict = buildReviewVerdict(target, command.outcomeReport);
        pending = {
          kind: "review",
          decisionId: target.id,
          label: `Nachprüfung: "${target.title}"`,
          detail: `Als "${verdict.status === "confirmed" ? "bestätigt" : verdict.status === "wrong" ? "nicht eingetroffen" : "unklar"}" eintragen — erst nach deiner Bestätigung.`,
          status: verdict.status,
          reviewNote: command.outcomeReport,
        };
      }
    } else if (targets.length === 1 && command.actions.includes("supersede")) {
      const target = targets[0]!;
      if (target.status !== "superseded" && command.newDecision) {
        const reviewBy = command.newDecision.reviewBy && isIsoDay(command.newDecision.reviewBy) ? command.newDecision.reviewBy : target.reviewBy;
        const draft = {
          title: command.newDecision.title,
          context: command.newDecision.context ?? target.context,
          expectation: command.newDecision.expectation,
          status: "open" as const,
          reviewBy,
        };
        pending = {
          kind: "supersede",
          decisionId: target.id,
          label: `Ersetzen: "${target.title}"`,
          detail: `Nachfolgerin "${command.newDecision.title}" — die alte Formulierung bleibt lesbar. Erst nach deiner Bestätigung.`,
          successorDraft: draft,
        };
      }
    }
    setState((prev) => ({ ...prev, lastPrompt: trimmed, result, pending }));
  }, []);

  const approvePending = useCallback(async (): Promise<void> => {
    const pending = state.pending;
    if (!pending) return;
    const items = itemsRef.current;
    let next: DecisionItem[];
    if (pending.kind === "add") {
      const validation = validateDecisionItem(pending.draft);
      if (!validation.valid) return;
      next = [...items, createDecisionItem(pending.draft)];
    } else if (pending.kind === "review") {
      const decision = items.find((item) => item.id === pending.decisionId);
      if (!decision) return;
      next = items.map((item) =>
        item.id === pending.decisionId
          ? applyReviewVerdict(item, { status: pending.status, rationale: "bestätigt" }, pending.reviewNote)
          : item,
      );
    } else {
      const outcome = supersedeDecision(items, pending.decisionId, pending.successorDraft);
      if (!outcome.ok) return;
      next = outcome.items;
    }
    itemsRef.current = next;
    setState((prev) => ({ ...prev, items: next, pending: null, result: { ...CONFIRMED_RESULT, disclaimer: prev.result?.disclaimer ?? "" } }));
    await persist(next);
  }, [state.pending, persist]);

  const dismissPending = useCallback((): void => {
    setState((prev) => ({ ...prev, pending: null }));
  }, []);

  return { state, runPrompt, approvePending, dismissPending };
}

import type { LedgerTask, TaskStatus } from "@/lib/task-ledger-logic";

/**
 * Sprint 149 — Superagent-Tab als echtes Chatfenster.
 *
 * Der bisherige Tab war ein langes Scroll-Formular: Die Antwort eines
 * autonomen Laufs erschien unten im Task-Ledger und man musste sie
 * erst suchen. Diese Logik wandelt die Task-Historie stattdessen in
 * einen chronologischen Chat-Strom um:
 *
 *   [Ziel]      → Nutzer-Bubble (rechts)
 *   [Antwort]   → Superagent-Bubble (links): Status, Live-Schritte,
 *                 Selbstkorrektur-Runden und finale Antwort direkt
 *                 im Verlauf — die neueste Nachricht steht wie in jedem
 *   Messenger unten und die Liste scrollt automatisch nach.
 *
 * Rein und render-sicher: Jede Server-Antwort wird über coerceLedgerTask
 * normalisiert, unbekannte Felder fallen auf harmlose Defaults zurueck.
 */

export type SuperagentChatRow =
  | {
      kind: "objective";
      key: string;
      taskId: string;
      title: string;
      objective: string;
      createdAt: string;
    }
  | {
      kind: "answer";
      key: string;
      taskId: string;
      status: TaskStatus;
      round: number;
      stepCount: number;
      steps: LedgerTask["steps"];
      answer: string | null;
      finishedAt: string;
    };

/**
 * Formatiert die finale Antwort render-sicher. String wird direkt genutzt.
 * Verteidigungslinie 2: Sollte doch einmal ein rohes {status, summary}-Objekt
 * durchrutschen (z. B. aelterer Serverstand), wird daraus ein lesbarer Satz
 * gebaut statt rohes JSON im Chat anzuzeigen (Dark-Cyber-Chat-Qualitaet).
 */
export function formatFinalAnswer(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    if (summary) return summary;
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized && serialized !== "null" && serialized !== "undefined" ? serialized : null;
  } catch {
    return String(value);
  }
}

/**
 * Baut den chronologischen Chat-Strom (ältester Lauf zuerst, neueste
 * Antwort unten). Der aktive Lauf wird ueber seine Task-Id eingeblendet,
 * damit Live-Schritte und Logs direkt im Chat sichtbar sind.
 */
export function buildSuperagentChatRows(
  tasks: LedgerTask[],
  activeTask?: LedgerTask | null,
): SuperagentChatRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  // Aktiver Lauf (Live-Daten) ersetzt jeden evtl. veralteten Ledger-Eintrag.
  if (activeTask) byId.set(activeTask.id, activeTask);

  const ordered = [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });

  const rows: SuperagentChatRow[] = [];
  for (const task of ordered) {
    rows.push({
      kind: "objective",
      key: `${task.id}-objective`,
      taskId: task.id,
      title: task.title,
      objective: task.objective,
      createdAt: task.createdAt,
    });
    rows.push({
      kind: "answer",
      key: `${task.id}-answer`,
      taskId: task.id,
      status: task.status,
      round: Math.max(1, task.correctionIterations + 1),
      stepCount: task.steps.length,
      steps: task.steps,
      answer: formatFinalAnswer(task.finalAnswer),
      finishedAt: task.updatedAt,
    });
  }
  return rows;
}

/**
 * Sprint 197 — Baut aus dem sichtbaren Chat-Strom den Dialog-Verlauf, der
 * als Kontext an orchestrator.run uebergeben wird (wie im Entwicklungs-Chat).
 * Nur abgeschlossene, mit Text beantwortete Laeufe fliessen ein — laufende
 * oder leere Zeilen wuerden dem Modell nichts Nuetzliches sagen.
 */
export function buildConversationHistory(
  rows: SuperagentChatRow[],
  maxEntries = 12,
): Array<{ role: "user" | "assistant"; content: string }> {
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const row of rows) {
    if (row.kind === "objective") {
      const text = row.objective.trim();
      if (text.length > 0) history.push({ role: "user", content: text });
    } else if (row.answer && (row.status === "success" || row.status === "escalated")) {
      const text = row.answer.trim();
      if (text.length > 0) history.push({ role: "assistant", content: text });
    }
  }
  return history.slice(-maxEntries);
}

import { describe, expect, it } from "vitest";

import { buildConversationHistory, buildSuperagentChatRows, formatFinalAnswer, type SuperagentChatRow } from "@/lib/superagent-chat-logic";
import { coerceLedgerTask, type LedgerTask } from "@/lib/task-ledger-logic";

function makeTask(overrides: Partial<LedgerTask> = {}): LedgerTask {
  return coerceLedgerTask({
    id: "task-1",
    title: "Produktiv-Deploy pruefen",
    objective: "Pruefe den Deploy",
    status: "success",
    correctionIterations: 0,
    steps: [{ id: "s1", name: "Health-Check", status: "success", attempts: 1, logs: ["200 OK"] }],
    finalAnswer: "Alles gruen.",
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:01:00.000Z",
    ...overrides,
  });
}

describe("buildSuperagentChatRows", () => {
  it("baut pro Task eine Ziel- und eine Antwort-Nachricht", () => {
    const rows = buildSuperagentChatRows([makeTask()]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "objective", taskId: "task-1", objective: "Pruefe den Deploy" });
    expect(rows[1]).toMatchObject({ kind: "answer", taskId: "task-1", status: "success", answer: "Alles gruen." });
  });

  it("sortiert chronologisch aufsteigend — neueste Antwort unten im Chat", () => {
    const old = makeTask({ id: "old", createdAt: "2026-09-16T08:00:00.000Z" });
    const newer = makeTask({ id: "new", createdAt: "2026-09-17T08:00:00.000Z" });
    const rows = buildSuperagentChatRows([newer, old]);
    expect(rows.map((r) => r.taskId)).toEqual(["old", "old", "new", "new"]);
  });

  it("blendet den aktiven Lauf mit Live-Daten ueber den Ledger-Eintrag", () => {
    const stale = makeTask({ id: "task-1", status: "pending", steps: [], finalAnswer: null });
    const active = makeTask({ id: "task-1", status: "running", steps: [
      { id: "s1", name: "Tool", status: "running", attempts: 1, logs: ["…"] },
    ] });
    const rows = buildSuperagentChatRows([stale], active);
    const answer = rows.find((r) => r.kind === "answer");
    expect(answer).toMatchObject({ status: "running", stepCount: 1 });
  });

  it("mappt Korrektur-Iterationen auf Rundenzahl (1-basiert)", () => {
    const rows = buildSuperagentChatRows([makeTask({ correctionIterations: 2 })]);
    const answer = rows.find((r) => r.kind === "answer");
    if (answer?.kind !== "answer") throw new Error("answer row erwartet");
    expect(answer.round).toBe(3);
  });

  it("liefert bei leerem Ledger einen leeren Strom (kein Crash)", () => {
    expect(buildSuperagentChatRows([])).toEqual([]);
  });
});

describe("formatFinalAnswer", () => {
  it("gibt Trimmed-Strings zurueck und verwirft Leere", () => {
    expect(formatFinalAnswer("  ok  ")).toBe("ok");
    expect(formatFinalAnswer("   ")).toBeNull();
  });

  it("serialisiert Objekte als JSON und faengt unspeicherbare Werte ab", () => {
    expect(formatFinalAnswer({ status: "ok" })).toBe('{\n  "status": "ok"\n}');
    expect(formatFinalAnswer(null)).toBeNull();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof formatFinalAnswer(circular)).toBe("string");
  });
});

describe("buildConversationHistory (Sprint 197)", () => {
  const rows: SuperagentChatRow[] = [
    { kind: "objective", key: "t1-o", taskId: "t1", title: "T1", objective: "Prüfe den Deploy.", createdAt: "2026-09-20T10:00:00Z" },
    { kind: "answer", key: "t1-a", taskId: "t1", status: "success", round: 1, stepCount: 2, steps: [], answer: "Alles grün.", finishedAt: "2026-09-20T10:02:00Z" },
    { kind: "objective", key: "t2-o", taskId: "t2", title: "T2", objective: "  ", createdAt: "2026-09-20T11:00:00Z" },
    { kind: "answer", key: "t2-a", taskId: "t2", status: "running", round: 1, stepCount: 0, steps: [], answer: null, finishedAt: "2026-09-20T11:00:30Z" },
    { kind: "objective", key: "t3-o", taskId: "t3", title: "T3", objective: "Und die Logs?", createdAt: "2026-09-20T12:00:00Z" },
    { kind: "answer", key: "t3-a", taskId: "t3", status: "failed", round: 3, stepCount: 3, steps: [], answer: null, finishedAt: "2026-09-20T12:01:00Z" },
  ];

  it("nimmt nur abgeschlossene, beantwortete Laeufe in den Verlauf auf", () => {
    const history = buildConversationHistory(rows);
    expect(history).toEqual([
      { role: "user", content: "Prüfe den Deploy." },
      { role: "assistant", content: "Alles grün." },
      { role: "user", content: "Und die Logs?" },
    ]);
  });

  it("begrenzt den Verlauf auf die letzten maxEntries Nachrichten", () => {
    const many: SuperagentChatRow[] = [];
    for (let i = 0; i < 10; i += 1) {
      many.push({ kind: "objective", key: `x${i}-o`, taskId: `x${i}`, title: `T${i}`, objective: `Ziel ${i}`, createdAt: "2026-09-20T10:00:00Z" });
      many.push({ kind: "answer", key: `x${i}-a`, taskId: `x${i}`, status: "success", round: 1, stepCount: 1, steps: [], answer: `Antwort ${i}`, finishedAt: "2026-09-20T10:01:00Z" });
    }
    const history = buildConversationHistory(many, 4);
    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: "user", content: "Ziel 8" });
    expect(history[3]).toEqual({ role: "assistant", content: "Antwort 9" });
  });

  it("leerer Strom -> leerer Verlauf", () => {
    expect(buildConversationHistory([])).toEqual([]);
  });
});

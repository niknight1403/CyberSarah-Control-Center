import { describe, expect, it } from "vitest";

import { buildSuperagentChatRows, formatFinalAnswer } from "@/lib/superagent-chat-logic";
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

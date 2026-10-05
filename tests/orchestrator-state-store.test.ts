import { beforeEach, describe, expect, it, vi } from "vitest";

const { values, getModelRouterSetting, setModelRouterSetting } = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    getModelRouterSetting: vi.fn(async <T>(key: string): Promise<T> => {
      if (!values.has(key)) throw new Error("not found");
      return values.get(key) as T;
    }),
    setModelRouterSetting: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
});

vi.mock("../server/db", () => ({ getModelRouterSetting, setModelRouterSetting }));

import { addStep, appendStepLog, createTask, finishTask, getTask, listTasks, recordCorrectionIteration, updateStep } from "../server/orchestrator/state-store";

describe("orchestrator state store", () => {
  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
  });

  it("creates tasks and indexes them newest-first without duplicate entries", async () => {
    const first = await createTask({ title: "First", objective: "Do first" });
    const second = await createTask({ title: "Second", objective: "Do second" });
    await finishTask(first.id, "running");

    expect(await getTask(first.id)).toMatchObject({ status: "running", correctionIterations: 0, steps: [] });
    expect(await listTasks()).toMatchObject([{ id: first.id, status: "running" }, { id: second.id, status: "pending" }]);
  });

  it("tracks step attempts, results, and keeps only the latest 100 log lines", async () => {
    const task = await createTask({ title: "Task", objective: "Objective" });
    const step = await addStep(task.id, "Work");
    expect(step).toMatchObject({ name: "Work", status: "pending", attempts: 0, logs: [] });
    await updateStep(task.id, step!.id, { status: "failed", error: "temporary" });
    await updateStep(task.id, step!.id, { status: "success", result: { ok: true } });
    for (let i = 0; i < 102; i += 1) await appendStepLog(task.id, step!.id, `line-${i}`);

    const saved = await getTask(task.id);
    expect(saved?.steps[0]).toMatchObject({ status: "success", attempts: 2, error: "temporary", result: { ok: true } });
    expect(saved?.steps[0].finishedAt).toBeTruthy();
    expect(saved?.steps[0].logs).toHaveLength(100);
    expect(saved?.steps[0].logs[0]).toContain("line-2");
    expect(saved?.steps[0].logs.at(-1)).toContain("line-101");
  });

  it("returns safe empty results for missing records and counts correction attempts", async () => {
    expect(await getTask("missing")).toBeNull();
    expect(await addStep("missing", "ignored")).toBeNull();
    await updateStep("missing", "step", { status: "success" });
    await appendStepLog("missing", "step", "ignored");
    await finishTask("missing", "failed");
    expect(await recordCorrectionIteration("missing")).toBe(0);
    expect(await recordCorrectionIteration("also-missing")).toBe(0);
    expect(await listTasks()).toEqual([]);

    const task = await createTask({ title: "Retry", objective: "Correct" });
    expect(await recordCorrectionIteration(task.id)).toBe(1);
    expect(await recordCorrectionIteration(task.id)).toBe(2);
    await finishTask(task.id, "success", { summary: "done" });
    expect(await getTask(task.id)).toMatchObject({ status: "success", correctionIterations: 2, finalAnswer: { summary: "done" } });
  });
});

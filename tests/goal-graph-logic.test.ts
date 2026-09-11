import { describe, expect, it } from "vitest";

import {
  decomposeGoal,
  describeGoalGraph,
  goalProgress,
  readySteps,
  topologicalOrder,
  transitionStep,
} from "../lib/goal-graph-logic";

describe("goal graph logic", () => {
  it("decomposes a goal into a chained default pipeline", () => {
    const graph = decomposeGoal("Sprint-Umsetzung");
    expect(graph.steps.map((step) => step.kind)).toEqual(["plan", "code", "test", "review", "deploy"]);
    expect(graph.steps[0].dependsOn).toEqual([]);
    expect(graph.steps[1].dependsOn).toEqual(["plan-1"]);
    expect(graph.steps.every((step) => step.status === "pending")).toBe(true);
  });

  it("accepts explicit steps and normalizes them", () => {
    const graph = decomposeGoal("Explizit", [
      { id: "a", title: "  Erster Schritt  ", kind: "code", status: "done", dependsOn: [] },
      { id: "b", title: "Zweiter", kind: "test", status: "unknown" as never, dependsOn: ["a"] },
    ]);
    expect(graph.steps[0].title).toBe("Erster Schritt");
    expect(graph.steps[1].status).toBe("pending");
  });

  it("orders steps topologically and detects cycles", () => {
    const dag = decomposeGoal("x", [
      { id: "c", title: "C", kind: "deploy", status: "pending", dependsOn: ["b"] },
      { id: "a", title: "A", kind: "plan", status: "pending", dependsOn: [] },
      { id: "b", title: "B", kind: "code", status: "pending", dependsOn: ["a"] },
    ]);
    const order = topologicalOrder(dag.steps);
    expect(order.ok).toBe(true);
    if (order.ok) expect(order.order).toEqual(["a", "b", "c"]);

    const cyclic = topologicalOrder([
      { id: "x", title: "X", kind: "code", status: "pending", dependsOn: ["y"] },
      { id: "y", title: "Y", kind: "code", status: "pending", dependsOn: ["x"] },
    ]);
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.cycle.sort()).toEqual(["x", "y"]);
  });

  it("computes ready steps from dependency completion", () => {
    const steps = decomposeGoal("x", [
      { id: "a", title: "A", kind: "plan", status: "done", dependsOn: [] },
      { id: "b", title: "B", kind: "code", status: "pending", dependsOn: ["a"] },
      { id: "c", title: "C", kind: "test", status: "pending", dependsOn: ["b"] },
    ]).steps;
    expect(readySteps(steps).map((step) => step.id)).toEqual(["b"]);
  });

  it("enforces the step state machine including dependencies", () => {
    const steps = decomposeGoal("x", [
      { id: "a", title: "A", kind: "code", status: "pending", dependsOn: [] },
      { id: "b", title: "B", kind: "test", status: "pending", dependsOn: ["a"] },
    ]).steps;

    const skipped = transitionStep(steps, "a", "done");
    expect(skipped.ok).toBe(false);

    const runningResult = transitionStep(steps, "a", "running");
    expect(runningResult.ok).toBe(true);
    const runningSteps = runningResult.ok ? runningResult.steps : steps;
    const tooEarly = transitionStep(runningSteps, "b", "running");
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.reason).toContain("Abhängigkeiten");

    const finishedResult = transitionStep(runningSteps, "a", "done");
    expect(finishedResult.ok).toBe(true);
    const finishedSteps = finishedResult.ok ? finishedResult.steps : runningSteps;
    const nowReady = transitionStep(finishedSteps, "b", "running");
    expect(nowReady.ok).toBe(true);
    const readyStepsResult = nowReady.ok ? nowReady.steps : finishedSteps;

    const retried = transitionStep(readyStepsResult, "b", "failed");
    expect(retried.ok).toBe(true);
    const recover = transitionStep(retried.ok ? retried.steps : readyStepsResult, "b", "pending");
    expect(recover.ok).toBe(true);
  });

  it("tracks progress, completion and blocked state", () => {
    const graph = decomposeGoal("Fertigstellen");
    let steps = graph.steps;
    const started = transitionStep(steps, "plan-1", "running");
    if (started.ok) steps = started.steps;
    const finished = transitionStep(steps, "plan-1", "done");
    if (finished.ok) steps = finished.steps;

    const inProgress = goalProgress(steps);
    expect(inProgress.done).toBe(1);
    expect(inProgress.fraction).toBeCloseTo(0.2);
    expect(inProgress.complete).toBe(false);

    const blockedSteps = decomposeGoal("y", [
      { id: "a", title: "A", kind: "code", status: "failed", dependsOn: [] },
      { id: "b", title: "B", kind: "test", status: "pending", dependsOn: ["a"] },
    ]).steps;
    expect(goalProgress(blockedSteps).blocked).toBe(true);

    const doneSteps = decomposeGoal("z", [
      { id: "a", title: "A", kind: "code", status: "done", dependsOn: [] },
    ]).steps;
    expect(goalProgress(doneSteps).complete).toBe(true);
  });

  it("describes the graph compactly for the UI", () => {
    const graph = decomposeGoal("Wichtig");
    const description = describeGoalGraph(graph);
    expect(description).toContain("Wichtig");
    expect(description).toContain("0/5");
    expect(description).toContain("Ziel analysieren");
  });
});

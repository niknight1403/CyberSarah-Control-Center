import { describe, it, expect } from "vitest";
import {
  taskStatus,
  pickRunnableTasks,
  missionComplete,
  describeMission,
  hasDependencyCycle,
} from "@/lib/subagent-delegation-logic";
import type { DelegationTask, Mission } from "@/lib/subagent-delegation-logic";

const task = (over: Partial<DelegationTask> = {}): DelegationTask => ({
  id: "a",
  topic: "Recherche",
  instruction: "Quellen sichten",
  dependsOn: [],
  conflictKeys: [],
  requiredCapabilities: [],
  ...over,
});

const caps = new Set(["web-suche", "entity-write"]);
const mission = (tasks: DelegationTask[], policy: Mission["policy"] = "all"): Mission => ({
  name: "M",
  objective: "Ziel",
  tasks,
  policy,
});

describe("Paritaet 3/6 — Sub-Agent-Delegation", () => {
  it("Tasks warten auf Abhaengigkeiten und bleiben ohne Capability blockiert", () => {
    const m = mission([task({ id: "a" }), task({ id: "b", dependsOn: ["a"] })]);
    expect(taskStatus(m, m.tasks[0], new Set(), caps)).toBe("bereit");
    expect(taskStatus(m, m.tasks[1], new Set(), caps)).toBe("wartet");
    expect(taskStatus(m, m.tasks[1], new Set(["a"]), caps)).toBe("bereit");
    const locked = task({ id: "c", requiredCapabilities: ["web-suche"] });
    expect(taskStatus(mission([locked]), locked, new Set(), new Set())).toBe("blockiert");
    expect(taskStatus(mission([locked]), locked, new Set(), caps)).toBe("bereit");
  });

  it("Konflikt-Keys verhindern Parallelitaet auf derselben Ressource", () => {
    const m = mission([
      task({ id: "a", conflictKeys: ["db"] }),
      task({ id: "b", conflictKeys: ["db"] }),
      task({ id: "c" }),
    ]);
    const running = new Set(["a"]);
    const runnable = pickRunnableTasks(m, new Set(), running, caps);
    expect(runnable.map((t) => t.id)).toEqual(["c"]);
    expect(pickRunnableTasks(m, new Set(["a"]), new Set(), caps).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("Policies: all erst wenn alles fertig, first_success beim ersten Ergebnis", () => {
    const m = mission([task({ id: "a" }), task({ id: "b" })], "all");
    expect(missionComplete(m, new Set(["a"]), new Set())).toBe(false);
    expect(missionComplete(m, new Set(["a", "b"]), new Set())).toBe(true);
    const f = mission([task({ id: "a" }), task({ id: "b" })], "first_success");
    expect(missionComplete(f, new Set(["a"]), new Set())).toBe(true);
    expect(missionComplete(f, new Set(), new Set(["b"]))).toBe(true); // alles gescheitert
  });

  it("Zykklenerkennung und Missions-Beschreibung", () => {
    expect(hasDependencyCycle(mission([task({ id: "a", dependsOn: ["b"] }), task({ id: "b", dependsOn: ["a"] })]))).toBe(true);
    expect(hasDependencyCycle(mission([task(), task({ id: "b", dependsOn: ["a"] })]))).toBe(false);
    const text = describeMission(mission([task({ id: "c", requiredCapabilities: ["x"] })]), new Set(), new Set());
    expect(text).toContain("[blockiert]");
    expect(text).toContain('policy' in {} ? "" : "all");
  });
});

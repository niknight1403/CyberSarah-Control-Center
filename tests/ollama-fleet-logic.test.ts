import { describe, expect, it } from "vitest";

import {
  assessFleetHealth,
  freeTierHint,
  normalizeQwenName,
  pickQwenForTask,
  planQwenPulls,
  readInstalledModels,
  recommendPrimaryRoute,
  type InferenceProbe,
} from "../lib/ollama-fleet-logic";

describe("pickQwenForTask", () => {
  it("waehlt das kleinste ausreichende Modell", () => {
    const all = ["qwen2.5:0.5b", "qwen2.5:1.5b", "qwen2.5:3b", "qwen2.5:7b"] as const;
    expect(pickQwenForTask("micro", all)).toBe("qwen2.5:0.5b");
    expect(pickQwenForTask("chat", all)).toBe("qwen2.5:1.5b");
    expect(pickQwenForTask("reasoning", all)).toBe("qwen2.5:3b");
    expect(pickQwenForTask("heavy", all)).toBe("qwen2.5:7b");
  });

  it("begrenzt sich auf Verfuegbares und rotiert abwaerts, nicht aufwaerts", () => {
    const small = ["qwen2.5:0.5b", "qwen2.5:1.5b"] as const;
    expect(pickQwenForTask("heavy", small)).toBe("qwen2.5:1.5b");
    expect(pickQwenForTask("micro", [])).toBeNull();
  });
});

describe("planQwenPulls", () => {
  it("plant nur fehlende Modelle bis zur Zielgroesse", () => {
    const plan = planQwenPulls(["qwen2.5:0.5b"], "qwen2.5:3b");
    expect(plan.pulls).toEqual(["qwen2.5:1.5b", "qwen2.5:3b"]);
    expect(plan.skippedTooLarge).toEqual(["qwen2.5:7b", "qwen2.5:14b"]);
  });

  it("leere Installation plant die ganze Leiter", () => {
    const plan = planQwenPulls([]);
    expect(plan.pulls).toEqual(["qwen2.5:0.5b", "qwen2.5:1.5b", "qwen2.5:3b", "qwen2.5:7b"]);
  });
});

describe("readInstalledModels / normalizeQwenName", () => {
  it("liest Namen aus /api/tags", () => {
    const names = readInstalledModels({ models: [{ name: "qwen2.5:0.5b" }, { model: "qwen2.5:3b" }, {}] });
    expect(names).toEqual(["qwen2.5:0.5b", "qwen2.5:3b"]);
  });

  it(" toleriert unvollstaendige Antworten", () => {
    expect(readInstalledModels(null)).toEqual([]);
    expect(readInstalledModels({})).toEqual([]);
  });

  it("normalisiert Tag-Varianten", () => {
    expect(normalizeQwenName("Qwen2.5:0.5b-Instruct")).toBe("qwen2.5:0.5b");
    expect(normalizeQwenName("llama3")).toBeNull();
  });
});

describe("assessFleetHealth", () => {
  const probe = (over: Partial<InferenceProbe>): InferenceProbe => ({ model: "qwen2.5:0.5b", latencyMs: 900, tokensPerSecond: 40, ok: true, ...over });

  it("gruen bei stabilen Modellen", () => {
    const fleet = assessFleetHealth([probe({}), probe({ model: "qwen2.5:1.5b" })]);
    expect(fleet.status).toBe("green");
  });

  it("gelb bei langsamen aber funktionierenden Modellen", () => {
    const fleet = assessFleetHealth([probe({ latencyMs: 20_000 })]);
    expect(fleet.status).toBe("yellow");
    expect(fleet.reasons.length).toBeGreaterThan(0);
  });

  it("rot bei keinen Messwerten oder totalem Ausfall", () => {
    expect(assessFleetHealth([]).status).toBe("red");
    expect(assessFleetHealth([probe({ ok: false })]).status).toBe("red");
  });
});

describe("recommendPrimaryRoute", () => {
  const green = assessFleetHealth([({ model: "qwen2.5:0.5b", latencyMs: 800, tokensPerSecond: 50, ok: true } as InferenceProbe)]);
  const red = assessFleetHealth([]);

  it("ollama primaer bei gruenem Fleet und guter Latenz", () => {
    expect(recommendPrimaryRoute(green, 1_500)).toBe("ollama");
  });

  it("cloud bei rot und bei gelb mit hoher Latenz", () => {
    expect(recommendPrimaryRoute(red, 100)).toBe("cloud");
    const yellow = assessFleetHealth([({ model: "qwen2.5:0.5b", latencyMs: 20_000, tokensPerSecond: 1, ok: true } as InferenceProbe)]);
    expect(recommendPrimaryRoute(yellow, 20_000)).toBe("cloud");
  });

  it("gelb mit akzeptabler Latenz bleibt lokal", () => {
    const yellow = assessFleetHealth([({ model: "qwen2.5:0.5b", latencyMs: 12_500, tokensPerSecond: 5, ok: true } as InferenceProbe)]);
    expect(recommendPrimaryRoute(yellow, 6_000)).toBe("ollama");
  });
});

describe("freeTierHint", () => {
  it("nennt ehrlich die Account-Pflicht statt Fake-Autopilot", () => {
    const hint = freeTierHint();
    expect(hint).toContain("Account noetig");
    expect(hint).toContain("ollama-server-setup.sh");
  });
});

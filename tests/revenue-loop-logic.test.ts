import { describe, expect, it } from "vitest";

import {
  createLoopDraft,
  evaluateLoopProgress,
  loopProgressPercent,
  loopStatusLabel,
  LOOP_DISCLAIMER,
  validateLoopDraft,
  type LoopDraft,
} from "../lib/revenue-loop-logic";

const VALID: Partial<LoopDraft> = {
  name: "Content-to-Lead",
  flow: "Content → Lead",
  hypothesis: "Kurze YouTube-Shorts führen pro Woche zu Newsletter-Anmeldungen.",
  experiment: "4 Wochen je 3 Shorts mit identischem CTA, Zähler im Newsletter-Tool.",
  metric: "Newsletter-Anmeldungen",
  unit: "Anmeldungen",
  targetValue: 100,
  currentValue: 0,
};

describe("revenue loop core (Sprint 222)", () => {
  it("erzeugt einen normalisierten Entwurf im Status draft", () => {
    const loop = createLoopDraft(VALID, () => 1_000);
    expect(loop.id).toBe("loop-rs"); // 1000 = "rs" in base36
    expect(loop.status).toBe("draft");
    expect(loop.samples).toEqual([]);
    expect(loop.createdAt).toBe(1_000);
    expect(loop.name).toBe("Content-to-Lead");
  });

  it("lehnt unvollständige und unsinnige Entwürfe mit Grund ab", () => {
    expect(validateLoopDraft({ ...VALID, name: "ab" }).reason).toContain("Name");
    expect(validateLoopDraft({ ...VALID, hypothesis: "kurz" }).reason).toContain("Hypothese");
    expect(validateLoopDraft({ ...VALID, targetValue: 0 }).reason).toContain("Ziel");
    expect(validateLoopDraft({ ...VALID, currentValue: -3 }).reason).toContain("aktuelle Wert");
    expect(validateLoopDraft({ ...VALID, unit: " " }).reason).toContain("Einheit");
    expect(createLoopDraft).toThrow();
  });

  it("beschreibt Status ehrlich und klemmt den Fortschritt", () => {
    expect(loopStatusLabel("draft")).toBe("Entwurf");
    expect(loopStatusLabel("stalled")).toBe("Steckengeblieben");
    const loop = createLoopDraft({ ...VALID, currentValue: 150 });
    expect(loopProgressPercent(loop)).toBe(100);
    expect(loopProgressPercent({ ...loop, currentValue: 25, targetValue: 200 })).toBeCloseTo(12.5, 10);
    expect(loopProgressPercent({ ...loop, targetValue: 0 })).toBe(0);
    expect(LOOP_DISCLAIMER).toContain("keine Umsatzgarantie");
  });
});

describe("revenue loop progress evaluation (Sprint 223)", () => {
  function loopWith(samples: Array<[number, number]>, status: LoopDraft["status"] = "running", target = 100): LoopDraft {
    const loop = createLoopDraft({ ...VALID, targetValue: target }, () => 1_000);
    loop.samples = samples.map(([at, value]) => ({ at, value }));
    loop.currentValue = samples.at(-1)?.[1] ?? 0;
    loop.status = status;
    return loop;
  }

  it("ohne Messpunkte ist der Fortschritt unbekannt, nicht null", () => {
    const verdict = evaluateLoopProgress(loopWith([]));
    expect(verdict.classification).toBe("unknown");
    expect(verdict.reason).toContain("unbekannt");
  });

  it("ein Messpunkt reicht für einen Prozentsatz, aber nicht für einen Trend", () => {
    const verdict = evaluateLoopProgress(loopWith([[1_000, 30]]));
    expect(verdict.classification).toBe("unknown");
    expect(verdict.reason).toContain("mindestens zwei");
    expect(verdict.percent).toBeCloseTo(30, 10);
  });

  it("bewertet Trend und Abstand ehrlich", () => {
    expect(evaluateLoopProgress(loopWith([[1, 60], [2, 70]])).classification).toBe("on-track");
    expect(evaluateLoopProgress(loopWith([[1, 20], [2, 15]])).classification).toBe("behind");
    expect(evaluateLoopProgress(loopWith([[1, 10], [2, 14]])).reason).toContain("steigt");
  });

  it("behandelt Abschluss und Stagnation als eigene Zustände", () => {
    const done = evaluateLoopProgress(loopWith([[1, 100], [2, 100]], "completed"));
    const reached = evaluateLoopProgress(loopWith([[1, 100], [2, 100]], "running"));
    expect(reached.reason).toContain("Bestätigung");
    expect(done.percent).toBe(100);
    expect(done.reason).toContain("Ziel erreicht");
    const stalled = evaluateLoopProgress(loopWith([[1, 20], [2, 21]], "stalled"));
    expect(stalled.classification).toBe("stalled");
    expect(evaluateLoopProgress(loopWith([], "discarded")).reason).toContain("verworfen");
  });
});

import { describe, expect, it } from "vitest";

import {
  createLoopDraft,
  evaluateLoopProgress,
  recommendNextStep,
  parseLoopPrompt,
  buildLoopResult,
  planExperiment,
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
  function loopWith(samples: [number, number][], status: LoopDraft["status"] = "running", target = 100): LoopDraft {
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

describe("revenue loop next step recommendation (Sprint 224)", () => {
  it("drafts need explicit approval to start", () => {
    const step = recommendNextStep(createLoopDraft(VALID, () => 1_000));
    expect(step.action).toBe("approve-start");
    expect(step.requiresApproval).toBe(true);
    expect(step.reason).toContain("Freigabe");
  });

  it("running loops without samples get the honest first measurement", () => {
    const loop = createLoopDraft(VALID, () => 1_000);
    loop.status = "running";
    const step = recommendNextStep(loop);
    expect(step.action).toBe("record-sample");
    expect(step.requiresApproval).toBe(false);
    expect(step.reason).toContain("unbekannt");
  });

  it("reaching the target asks for approval, never self-closes", () => {
    const loop = createLoopDraft(VALID, () => 1_000);
    loop.status = "running";
    loop.currentValue = 100;
    loop.samples = [{ at: 1, value: 100 }];
    const step = recommendNextStep(loop);
    expect(step.action).toBe("approve-completion");
    expect(step.requiresApproval).toBe(true);
  });

  it("persistent weak progress points to the hypothesis", () => {
    const loop = createLoopDraft(VALID, () => 1_000);
    loop.status = "running";
    loop.samples = [{ at: 1, value: 2 }, { at: 2, value: 3 }, { at: 3, value: 4 }];
    loop.currentValue = 4;
    const step = recommendNextStep(loop);
    expect(step.action).toBe("review-hypothesis");
    expect(step.title).toContain("überdenken");
  });

  it("terminal states recommend nothing new", () => {
    const done = createLoopDraft(VALID, () => 1_000);
    done.status = "completed";
    expect(recommendNextStep(done).action).toBe("none");
    const discarded = createLoopDraft(VALID, () => 1_000);
    discarded.status = "discarded";
    expect(recommendNextStep(discarded).action).toBe("none");
    const stalled = createLoopDraft(VALID, () => 1_000);
    stalled.status = "stalled";
    expect(recommendNextStep(stalled).title).toContain("Blockade");
  });
});

describe("revenue loop experiment planner (Sprint 225)", () => {
  const loop = createLoopDraft(VALID, () => 1_000);

  it("plant Messfenster mit Intervall und verspricht nie Umsatz", () => {
    const plan = planExperiment(loop, 28);
    expect(plan.durationDays).toBe(28);
    expect(plan.sampleIntervalDays).toBe(7);
    expect(plan.expectedSamples).toBe(4);
    expect(plan.promisedRevenue).toBe(false);
    expect(plan.caveats[0]).toContain("keine Prognosen");
  });

  it("lehnt zu kurze Fenster ab und klemmt zu lange", () => {
    expect(() => planExperiment(loop, 3)).toThrow("mindestens 7 Tage");
    const long = planExperiment(loop, 365);
    expect(long.durationDays).toBe(90);
    expect(long.caveats.some((caveat) => caveat.includes("geklemmt"))).toBe(true);
  });

  it("warnt ehrlich bei Mini-Zielen und bereits laufenden Schleifen", () => {
    const tiny = planExperiment({ ...loop, targetValue: 1 }, 28);
    expect(tiny.caveats.some((caveat) => caveat.includes("Mini-Ziel") || caveat.includes("kleines Ziel"))).toBe(true);
    const running = planExperiment({ ...loop, status: "running" }, 28);
    expect(running.caveats.some((caveat) => caveat.includes("Restfenster"))).toBe(true);
  });
});

describe("revenue loop prompt parsing (Sprint 226)", () => {
  it("leerer und unklarer Prompt endet in einer sicheren Anfrage", () => {
    expect(parseLoopPrompt("").actions).toEqual(["list"]);
    expect(parseLoopPrompt("hm?").actions).toEqual(["status"]);
  });

  it("parst create mit Feldern, Einheiten und deutschem Zahlenformat", () => {
    const command = parseLoopPrompt(
      "Erstelle eine neue Schleife. Name: SaaS-Conversion; Fluss: Trial - Abo; Hypothese: Onboarding-Mails erhöhen die Abo-Umwandlung; Experiment: 4 Wochen gesteuerte Onboarding-Serie; Messgröße: Abo-Umwandlungen; Einheit: Abos; Ziel: 25",
    );
    expect(command.actions).toContain("create");
    expect(command.draft?.name).toBe("SaaS-Conversion");
    expect(command.draft?.flow).toBe("Trial - Abo");
    expect(command.draft?.targetValue).toBe(25);
    expect(validateLoopDraft({ ...VALID, ...command.draft }).valid).toBe(true);
  });

  it("parst Messpunkte mit Namensbezug", () => {
    const command = parseLoopPrompt("Messpunkt für \"Content-to-Lead\": Wert 40");
    expect(command.actions).toContain("sample");
    expect(command.sampleValue).toBe(40);
    expect(command.nameQuery).toBe("Content-to-Lead");
  });

  it("verneinte Aufträge werden niemals ausführend", () => {
    const command = parseLoopPrompt("Zeig den Status, aber nicht starten");
    expect(command.actions).toEqual(["status"]);
    expect(command.draft).toBeNull();
    expect(command.sampleValue).toBeNull();
    const discard = parseLoopPrompt("Status von Content-to-Lead, aber nicht löschen");
    expect(discard.actions).toEqual(["status"]);
  });

  it("erkennt Aufräumen, Start und Übersicht", () => {
    expect(parseLoopPrompt("Starte Content-to-Lead").actions).toContain("advance");
    expect(parseLoopPrompt("Zeig alle Schleifen").actions).toContain("list");
    expect(parseLoopPrompt("Verwirf SaaS-Conversion").actions).toContain("discard");
  });
});

describe("revenue loop honest result builder (Sprint 227)", () => {
  const loopA = createLoopDraft(VALID, () => 1_000);
  const loopB = createLoopDraft({ ...VALID, name: "SaaS-Conversion" }, () => 2_000);
  const loops = [loopA, loopB];

  it("listet ehrlich inklusive echtem Leerzustand", () => {
    const result = buildLoopResult({ actions: ["list"], nameQuery: null, draft: null, sampleValue: null }, []);
    expect(result.lines[0]).toContain("leere Zustand ist echt");
    const listed = buildLoopResult({ actions: ["list"], nameQuery: null, draft: null, sampleValue: null }, loops);
    expect(listed.lines[0]).toContain("2 Schleife(n)");
    expect(listed.headline).toBe("Loop-Engineering");
  });

  it("bewertet eine eindeutige Schleife mit Fortschritt und nächstem Schritt", () => {
    const running = { ...loopA, status: "running" as const, currentValue: 40, samples: [{ at: 1, value: 40 }] };
    const result = buildLoopResult(parseLoopPrompt("Status von Content-to-Lead"), [running]);
    expect(result.headline).toBe("Schleife: Content-to-Lead");
    expect(result.lines.some((line) => line.includes("40 %"))).toBe(true);
    expect(result.lines.some((line) => line.startsWith("Nächster Schritt:"))).toBe(true);
  });

  it("lehnt fehlende Felder und uneindeutige Namen ehrlich ab", () => {
    const create = buildLoopResult({ actions: ["create"], nameQuery: null, draft: { name: "x" }, sampleValue: null }, []);
    expect(create.lines.some((line) => line.includes("plausibel") || line.includes("abgelehnt"))).toBe(true);
    const createEmpty = buildLoopResult({ actions: ["create"], nameQuery: null, draft: null, sampleValue: null }, []);
    expect(createEmpty.lines[0]).toContain("Kein Entwurf erkannt");
    const ambiguous = buildLoopResult({ actions: ["status"], nameQuery: "e", draft: null, sampleValue: null }, loops);
    expect(ambiguous.lines.some((line) => line.includes("Uneindeutig"))).toBe(true);
  });

  it("Messwert und Änderungen bleiben Freigabe-Anfragen", () => {
    const sample = buildLoopResult(parseLoopPrompt("Messpunkt für \"Content-to-Lead\": Wert 40"), loops);
    expect(sample.lines.some((line) => line.includes("vorgemerkt") && line.includes("Bestätigung"))).toBe(true);
    const advance = buildLoopResult(parseLoopPrompt("Starte Content-to-Lead"), loops);
    expect(advance.lines.some((line) => line.includes("erst nach deiner Bestätigung"))).toBe(true);
  });
});

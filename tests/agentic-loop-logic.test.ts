import { describe, expect, it } from "vitest";
import {
  buildReflectionContext,
  combineValidators,
  computeIterationConfidence,
  initAgenticLoopState,
  jsonOutputValidator,
  normalizeAgenticLoopConfig,
  shouldContinue,
  stepAgenticLoop,
  structureValidator,
  type AgenticLoopState,
  type IterationOutcome,
} from "../lib/agentic-loop-logic";

const config = normalizeAgenticLoopConfig({ maxLoops: 3, timeoutMs: 60_000, maxTotalTokens: 10_000, minConfidence: 0.7 });

const outcome = (over: Partial<IterationOutcome>): IterationOutcome => ({
  output: '{"a":1}',
  tokensUsed: 100,
  durationMs: 10,
  validation: { valid: true, errors: [], confidence: 0.9 },
  agentError: null,
  ...over,
});

const invalidOutcome = (errors: string[], over: Partial<IterationOutcome> = {}): IterationOutcome =>
  outcome({ validation: { valid: false, errors, confidence: 0 }, ...over });

describe("Agentic Loop — Konfiguration", () => {
  it("klemmt unsinnige Werte hart", () => {
    const c = normalizeAgenticLoopConfig({ maxLoops: 0, timeoutMs: -5, maxTotalTokens: Number.POSITIVE_INFINITY, minConfidence: 9 });
    expect(c.maxLoops).toBe(1);
    expect(c.timeoutMs).toBe(100);
    expect(c.maxTotalTokens).toBe(100_000_000);
    expect(c.minConfidence).toBe(1);
  });

  it("fuellt Defaults und akzeptiert gueltige Werte", () => {
    const c = normalizeAgenticLoopConfig({ maxLoops: 5 });
    expect(c.maxLoops).toBe(5);
    expect(c.timeoutMs).toBe(30_000);
    expect(c.minConfidence).toBe(0.7);
  });
});

describe("Agentic Loop — Validierungs-Middleware", () => {
  it("JSON-Validator erkennt JSON im Text-Rauschen und weist Muell ab", () => {
    expect(jsonOutputValidator().validate('Vorab: {"a":1} Ende').valid).toBe(true);
    expect(jsonOutputValidator().validate("keine klammer").valid).toBe(false);
    expect(jsonOutputValidator().validate("[1,2,3]").valid).toBe(false); // Array ist kein Objekt
  });

  it("Struktur-Validator prueft Pflichtfelder und Typen", () => {
    const v = structureValidator([
      { key: "title", type: "string" },
      { key: "steps", type: "array" },
    ]);
    const good = v.validate('{"title":"Plan","steps":[1,2]}');
    expect(good.valid).toBe(true);
    const bad = v.validate('{"title":42,"steps":"nope"}');
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.includes('"title"'))).toBe(true);
    const missing = v.validate("{}");
    expect(missing.errors.filter((e) => e.includes("fehlt"))).toHaveLength(2);
  });

  it("combineValidators aggregiert Fehler aller Stufen", () => {
    const combined = combineValidators([jsonOutputValidator(), structureValidator([{ key: "x", type: "string" }])]);
    const result = combined.validate("kein json");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("[json]"))).toBe(true);
    expect(result.errors.some((e) => e.startsWith("[structure]"))).toBe(true);
  });
});

describe("Agentic Loop — Zustandsmaschine", () => {
  it("Initialzustand ist sauber 'running'", () => {
    const s = initAgenticLoopState();
    expect(s.status).toBe("running");
    expect(s.iteration).toBe(0);
    expect(s.history).toHaveLength(0);
    expect(s.reflectionContext).toHaveLength(0);
  });

  it("Erfolg im ersten Durchgang: succeeded mit Konfidenz und Historie", () => {
    const next = stepAgenticLoop(initAgenticLoopState(), config, outcome({}));
    expect(next.status).toBe("succeeded");
    expect(next.iteration).toBe(1);
    expect(next.confidence).toBeGreaterThanOrEqual(config.minConfidence);
    expect(next.history[0].valid).toBe(true);
    expect(next.reflectionContext).toHaveLength(0);
  });

  it("Nach einem Fehler: laufend mit strukturiertem Reflexionskontext", () => {
    const next = stepAgenticLoop(initAgenticLoopState(), config, invalidOutcome(["Feld a fehlt."]));
    expect(next.status).toBe("running");
    expect(next.iteration).toBe(1);
    expect(next.reflectionContext.some((line) => line.includes("Feld a fehlt."))).toBe(true);
    expect(next.reflectionContext.some((line) => line.includes("Iteration 1"))).toBe(true);
    // Agent-Fehler wandern in den Kontext
    const withAgentError = stepAgenticLoop(initAgenticLoopState(), config, invalidOutcome([], { agentError: "HTTP 500" }));
    expect(withAgentError.reflectionContext.some((line) => line.includes("HTTP 500"))).toBe(true);
  });

  it("Selbstkorrektur in Iteration 2: valid + Konfidenz-Verfall praegiert Erfolg", () => {
    let s: AgenticLoopState = stepAgenticLoop(initAgenticLoopState(), config, invalidOutcome(["x falsch"]));
    s = stepAgenticLoop(s, config, outcome({ validation: { valid: true, errors: [], confidence: 0.95 } }));
    expect(s.status).toBe("succeeded");
    expect(s.history).toHaveLength(2);
    expect(s.history[0].valid).toBe(false);
    expect(s.history[1].valid).toBe(true);
    // 0.95 * 0.9^1 = 0.855 — Verfall sichtbar aber noch ueber Schwelle
    expect(s.confidence).toBeCloseTo(0.855, 3);
  });

  it("Konfidenz unter Schwelle trotz gueltiger Struktur haelt weiter", () => {
    const next = stepAgenticLoop(initAgenticLoopState(), config, outcome({ validation: { valid: true, errors: [], confidence: 0.5 } }));
    expect(next.status).toBe("running"); // strukturvalid, aber kein Erfolgsergebnis
    expect(next.history[0].valid).toBe(true);
    expect(next.history[0].confidence).toBe(0.5);
  });

  it("halted_max_loops nach letzter Iteration ohne gueltige Ausgabe", () => {
    let s = initAgenticLoopState();
    s = stepAgenticLoop(s, config, invalidOutcome(["1"]));
    s = stepAgenticLoop(s, config, invalidOutcome(["2"]));
    s = stepAgenticLoop(s, config, invalidOutcome(["3"]));
    expect(s.status).toBe("halted_max_loops");
    expect(s.iteration).toBe(3);
    expect(s.haltedReason).toContain("max_loops");
    // Nach Halt: keine weiteren Uebergaenge mehr
    expect(stepAgenticLoop(s, config, outcome({})).status).toBe("halted_max_loops");
  });

  it("halted_token_budget greift vor max_loops, wenn Tokens zuerst aufgebraucht sind", () => {
    const tightConfig = normalizeAgenticLoopConfig({ maxLoops: 5, timeoutMs: 60_000, maxTotalTokens: 150, minConfidence: 0.7 });
    let s = initAgenticLoopState();
    s = stepAgenticLoop(s, tightConfig, invalidOutcome(["x"], { tokensUsed: 100 }));
    s = stepAgenticLoop(s, tightConfig, invalidOutcome(["y"], { tokensUsed: 100 }));
    expect(s.status).toBe("halted_token_budget");
    expect(s.tokensUsed).toBe(200);
  });

  it("halted_timeout, wenn die kumulierte Dauer das Zeitbudget reisst", () => {
    const tightConfig = normalizeAgenticLoopConfig({ maxLoops: 5, timeoutMs: 100, maxTotalTokens: 1_000_000, minConfidence: 0.7 });
    let s = initAgenticLoopState();
    s = stepAgenticLoop(s, tightConfig, invalidOutcome(["x"], { durationMs: 60 }));
    s = stepAgenticLoop(s, tightConfig, invalidOutcome(["y"], { durationMs: 60 }));
    expect(s.status).toBe("halted_timeout");
    expect(s.elapsedMs).toBe(120);
  });

  it("shouldContinue respektiert alle Halte-Grenzen", () => {
    const running = stepAgenticLoop(initAgenticLoopState(), config, invalidOutcome(["x"]));
    expect(shouldContinue(running, config, 5)).toBe(true);
    expect(shouldContinue(running, config, 60_000)).toBe(false); // Gesamt-Timeout
    expect(shouldContinue({ ...running, status: "succeeded" }, config, 0)).toBe(false);
    expect(shouldContinue({ ...running, iteration: config.maxLoops }, config, 0)).toBe(false);
    expect(shouldContinue({ ...running, tokensUsed: config.maxTotalTokens }, config, 0)).toBe(false);
  });

  it("Konfidenz-Verfall: jeder Fehlversuch kostet 10 % Basis", () => {
    expect(computeIterationConfidence(1, 0)).toBe(1);
    expect(computeIterationConfidence(1, 2)).toBeCloseTo(0.81, 4);
    expect(computeIterationConfidence(0.5, 0)).toBe(0.5);
  });

  it("Reflexionskontext warnt vor Wiederholung frueherer Fehler", () => {
    let s = stepAgenticLoop(initAgenticLoopState(), config, invalidOutcome(["Fehler A"]));
    s = stepAgenticLoop(s, config, invalidOutcome(["Fehler B"]));
    const context = buildReflectionContext(s, s.history[s.history.length - 1]);
    expect(context.some((line) => line.includes("Iteration 2"))).toBe(true);
    expect(context.some((line) => line.includes("Fehler A"))).toBe(true);
    expect(context.some((line) => line.includes("wiederhole nicht"))).toBe(true);
  });
});

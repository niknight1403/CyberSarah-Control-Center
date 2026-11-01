import { describe, expect, it } from "vitest";
import { runAgenticLoop } from "../server/agentic-loop-coordinator";
import { combineValidators, jsonOutputValidator, structureValidator } from "../lib/agentic-loop-logic";
import { AgenticLoopTelemetryBus } from "../server/agentic-loop-telemetry";
import { assertLoopEventSequence, type AgenticLoopEvent } from "../lib/agentic-loop-telemetry-logic";

const validate = combineValidators([jsonOutputValidator(), structureValidator([{ key: "answer", type: "string" }])]);

/** Deterministische Skript-Uhr: startet bei 1.000 ms, jeder Tick +1 ms. */
function fakeClock() {
  let now = 1_000;
  return () => (now += 1);
}

describe("Agentic Loop Koordinator — Integration", () => {
  it("Erfolgreicher Single-Pass: 1 Iteration, succeeded, Konfidenz ueber Schwelle", async () => {
    const calls: number[] = [];
    const result = await runAgenticLoop({
      maxLoops: 3,
      validate,
      agentStep: async (iteration) => {
        calls.push(iteration);
        return { output: '{"answer":"42"}', tokensUsed: 120 };
      },
    });
    expect(result.state.status).toBe("succeeded");
    expect(result.iterations).toBe(1);
    expect(calls).toEqual([1]);
    expect(result.state.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.state.lastOutput).toBe('{"answer":"42"}');
    expect(result.state.haltedReason).toBeNull();
  });

  it("Selbstkorrektur: Iteration 1 ungueltig, Iteration 2 nutzt Reflexionskontext und besteht", async () => {
    const seenContexts: string[][] = [];
    let call = 0;
    const result = await runAgenticLoop({
      maxLoops: 3,
      validate,
      agentStep: async (iteration, reflectionContext) => {
        seenContexts.push([...reflectionContext]);
        call += 1;
        return call === 1
          ? { output: "kein json, nur geplapper", tokensUsed: 80 }
          : { output: '{"answer":"die Loesung"}', tokensUsed: 90 };
      },
    });
    expect(result.state.status).toBe("succeeded");
    expect(result.iterations).toBe(2);
    expect(result.state.history).toHaveLength(2);
    expect(result.state.history[0].valid).toBe(false);
    expect(result.state.history[1].valid).toBe(true);
    // Iteration 2 bekam den strukturierten Feedback-Kontext
    expect(seenContexts[0]).toHaveLength(0);
    expect(seenContexts[1].some((line) => line.includes("gueltiges JSON"))).toBe(true);
    expect(result.totalTokens).toBe(170);
  });

  it("halted_max_loops: Agent bleibt ungueltig — Historie voll, kein Fake-Erfolg", async () => {
    const result = await runAgenticLoop({
      maxLoops: 3,
      validate,
      agentStep: async () => ({ output: '{"falsch":true}', tokensUsed: 50 }),
    });
    expect(result.state.status).toBe("halted_max_loops");
    expect(result.iterations).toBe(3);
    expect(result.state.history.every((entry) => !entry.valid)).toBe(true);
    expect(result.state.haltedReason).toContain("max_loops");
    expect(result.state.lastOutput).toBe('{"falsch":true}');
  });

  it("Token-Budget-Halt: koestet der Agent zu viel, stoppt die Schleife ehrlich", async () => {
    const result = await runAgenticLoop({
      maxLoops: 10,
      maxTotalTokens: 120,
      validate,
      agentStep: async () => ({ output: "kaputt", tokensUsed: 50 }),
    });
    expect(result.state.status).toBe("halted_token_budget");
    expect(result.state.tokensUsed).toBeGreaterThanOrEqual(120);
    expect(result.iterations).toBeLessThanOrEqual(10);
  });

  it("Timeout-Halt: langsamer Agent wird per Restzeit hart abgebrochen", async () => {
    const started = Date.now();
    const result = await runAgenticLoop({
      maxLoops: 10,
      timeoutMs: 120,
      validate,
      agentStep: async (iteration, _context, remainingMs) => {
        if (iteration === 1) await new Promise((resolve) => setTimeout(resolve, 80));
        return { output: "kaputt", tokensUsed: 10 }; // 80ms Iteration + Rest
      },
    });
    const wall = Date.now() - started;
    expect(["halted_timeout", "halted_max_loops"]).toContain(result.state.status);
    expect(wall).toBeLessThan(2_000); // kein endloser Loop
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.state.history.length).toBe(result.iterations);
  }, 10_000);

  it("Resilienz: Agent-Ausnahme wird verbucht; Heilung im Folgeschritt fuehrt zum Erfolg", async () => {
    let call = 0;
    const result = await runAgenticLoop({
      maxLoops: 4,
      maxAgentErrors: 2,
      validate,
      agentStep: async () => {
        call += 1;
        if (call === 1) throw new Error("Ollama-Verbindung abgerissen");
        return { output: '{"answer":"nach reconnect"}', tokensUsed: 60 };
      },
    });
    expect(result.state.status).toBe("succeeded");
    expect(result.iterations).toBe(2);
    expect(result.state.history[0].agentError).toContain("abgerissen");
    expect(result.state.history[0].valid).toBe(false);
    expect(result.state.history[0].tokensUsed).toBe(250); // Absturz verbucht Mindestkosten
  });

  it("Resilienz-Grenze: maxAgentErrors aufeinanderfolgende Abstuerze enden in failed", async () => {
    const result = await runAgenticLoop({
      maxLoops: 5,
      maxAgentErrors: 2,
      validate,
      agentStep: async () => {
        throw new Error("dauerhaft tot");
      },
    });
    expect(result.state.status).toBe("failed");
    expect(result.state.haltedReason).toContain("aufeinanderfolgende Agent-Fehler");
    expect(result.state.history.every((entry) => entry.agentError !== null)).toBe(true);
  });

  it("Ungueltige Konfiguration wird geklemmt: maxLoops=0 bedeutet 1 Durchgang", async () => {
    const result = await runAgenticLoop({
      maxLoops: 0,
      validate,
      agentStep: async () => ({ output: "kaputt", tokensUsed: 10 }),
    });
    expect(result.iterations).toBe(1);
    expect(result.state.status).toBe("halted_max_loops");
  });
});

describe("Koordinator — Telemetrie-Integration (Sprint 353)", () => {
  it("ohne Telemetrie-Optionen bleibt das Verhalten unveraendert (non-breaking)", async () => {
    const result = await runAgenticLoop({
      validate,
      agentStep: async () => ({ output: '{"answer":"ok"}', tokensUsed: 10 }),
    });
    expect(result.state.status).toBe("succeeded");
  });

  it("kompletter Lifecycle feuert die Events in korrekter Reihenfolge", async () => {
    const bus = new AgenticLoopTelemetryBus();
    const events: AgenticLoopEvent[] = [];
    bus.subscribe("loop-live", (event) => events.push(event));

    const result = await runAgenticLoop({
      validate,
      telemetryBus: bus,
      sessionId: "loop-live",
      task: "Demo-Aufgabe",
      maxLoops: 3,
      agentStep: async (iteration) =>
        iteration === 1
          ? { output: "ungueltig", tokensUsed: 40 }
          : { output: '{"answer":"geheilt"}', tokensUsed: 50 },
    });
    expect(result.state.status).toBe("succeeded");
    expect(events.map((event) => event.event)).toEqual([
      "loop:start",
      "iteration:start", "reflection:failed",
      "iteration:start", "validation:success",
      "loop:complete",
    ]);
    const sequence = assertLoopEventSequence(events);
    expect(sequence.ok).toBe(true);
    expect(events[0].payload.task).toBe("Demo-Aufgabe");
    expect(events[0].payload.maxLoops).toBe(3);
    const failed = events.find((event) => event.event === "reflection:failed");
    expect((failed?.payload.errors as string[]).join(" ")).toContain("JSON");
    const complete = events.find((event) => event.event === "loop:complete");
    expect(complete?.payload.status).toBe("succeeded");
    expect(complete?.payload.totalTokens).toBe(90);
  });

  it("max_loops-Erschoepfung sendet loop:max_reached mit allen Zwischen-Fehlern", async () => {
    const bus = new AgenticLoopTelemetryBus();
    const events: AgenticLoopEvent[] = [];
    bus.subscribe("loop-doom", (event) => events.push(event));
    await runAgenticLoop({
      validate,
      telemetryBus: bus,
      sessionId: "loop-doom",
      maxLoops: 2,
      agentStep: async () => ({ output: "müll", tokensUsed: 30 }),
    });
    expect(events.map((event) => event.event)).toEqual([
      "loop:start",
      "iteration:start", "reflection:failed",
      "iteration:start", "reflection:failed",
      "loop:max_reached",
    ]);
    expect(assertLoopEventSequence(events).ok).toBe(true);
    const maxReached = events.find((event) => event.event === "loop:max_reached");
    expect(maxReached?.payload.status).toBe("halted_max_loops");
    expect(maxReached?.payload.iterations).toBe(2);
  });

  it("Reconnect sieht den kompletten Lauf per Last-Event-ID-Replay", async () => {
    const bus = new AgenticLoopTelemetryBus();
    await runAgenticLoop({
      validate,
      telemetryBus: bus,
      sessionId: "loop-replay",
      maxLoops: 3,
      agentStep: async () => ({ output: '{"answer":"einmal reicht"}', tokensUsed: 10 }),
    });
    // "Verbindung" erst NACH dem Lauf: Replay muss alles nachliefern
    const replayed: AgenticLoopEvent[] = [];
    const { replayed: events } = bus.subscribeWithReplay("loop-replay", () => undefined, 0);
    replayed.push(...events);
    expect(replayed.map((event) => event.event)).toEqual(["loop:start", "iteration:start", "validation:success", "loop:complete"]);
    expect(assertLoopEventSequence(replayed).ok).toBe(true);
  });
});

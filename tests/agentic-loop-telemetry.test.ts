import { describe, expect, it } from "vitest";
import {
  assertLoopEventSequence,
  buildIterationStartEvent,
  buildLoopStartEvent,
  buildReflectionFailedEvent,
  buildTerminalEvent,
  buildValidationSuccessEvent,
  isValidLoopSessionId,
  replayLoopEvents,
  type AgenticLoopEvent,
} from "../lib/agentic-loop-telemetry-logic";
import { AgenticLoopTelemetryBus } from "../server/agentic-loop-telemetry";
import { initAgenticLoopState, normalizeAgenticLoopConfig, stepAgenticLoop, type IterationOutcome } from "../lib/agentic-loop-logic";

const config = normalizeAgenticLoopConfig({ maxLoops: 3, timeoutMs: 60_000, maxTotalTokens: 10_000, minConfidence: 0.7 });
const outcome = (over: Partial<IterationOutcome>): IterationOutcome => ({
  output: '{"a":1}',
  tokensUsed: 100,
  durationMs: 10,
  validation: { valid: true, errors: [], confidence: 0.9 },
  agentError: null,
  ...over,
});

/** Fuehrt einen Loop deterministisch aus und sammelt alle Events (mit ID-Nummerierung). */
function runTracedLoop(agentScript: (iteration: number) => IterationOutcome): AgenticLoopEvent[] {
  const bus = new AgenticLoopTelemetryBus();
  const recorded: AgenticLoopEvent[] = [];
  const handler = (event: AgenticLoopEvent) => recorded.push(event);
  bus.subscribe("sess-01", handler);

  bus.emit("sess-01", buildLoopStartEvent("sess-01", config, "Testaufgabe"));
  let state = initAgenticLoopState();
  while (state.status === "running") {
    bus.emit("sess-01", buildIterationStartEvent("sess-01", state.iteration + 1, state.reflectionContext));
    const next = stepAgenticLoop(state, config, agentScript(state.iteration + 1));
    const record = next.history[next.history.length - 1];
    bus.emit(
      "sess-01",
      record.valid
        ? buildValidationSuccessEvent("sess-01", record, next.lastOutput ?? "")
        : buildReflectionFailedEvent("sess-01", record, next.reflectionContext),
    );
    state = next;
  }
  bus.emit("sess-01", buildTerminalEvent("sess-01", state));
  return recorded;
}

describe("Telemetrie — Event-Payloads", () => {
  it("validiert Session-IDs sicher (Pfad-Injektion abgewehrt)", () => {
    expect(isValidLoopSessionId("sess-01_ABC")).toBe(true);
    expect(isValidLoopSessionId("../etc")).toBe(false);
    expect(isValidLoopSessionId("a b")).toBe(false);
    expect(isValidLoopSessionId("abc")).toBe(false); // zu kurz
    expect(isValidLoopSessionId("x".repeat(65))).toBe(false);
  });

  it("loop:start traegt Aufgabe und alle Grenzen", () => {
    const payload = buildLoopStartEvent("sess-01", config, "Aufgabe").payload;
    expect(payload.maxLoops).toBe(3);
    expect(payload.minConfidence).toBe(0.7);
    expect(payload.task).toBe("Aufgabe");
  });

  it("Terminal: Erfolg => loop:complete mit Finalausgabe, Erschoepfung => loop:max_reached", () => {
    let state = initAgenticLoopState();
    state = stepAgenticLoop(state, config, outcome({}));
    const complete = buildTerminalEvent("sess-01", state);
    expect(complete.event).toBe("loop:complete");
    expect(complete.payload.finalOutput).toBe('{"a":1}');
    expect(complete.payload.iterations).toBe(1);

    let halted = initAgenticLoopState();
    halted = stepAgenticLoop(halted, config, outcome({ validation: { valid: false, errors: ["x"], confidence: 0 } }));
    halted = stepAgenticLoop(halted, config, outcome({ validation: { valid: false, errors: ["x"], confidence: 0 } }));
    halted = stepAgenticLoop(halted, config, outcome({ validation: { valid: false, errors: ["x"], confidence: 0 } }));
    const maxReached = buildTerminalEvent("sess-01", halted);
    expect(maxReached.event).toBe("loop:max_reached");
    expect(maxReached.payload.status).toBe("halted_max_loops");
    expect(maxReached.payload.haltedReason).toContain("max_loops");
  });

  it("reflection:failed traegt Validierungsfehler UND den Feedback-Kontext", () => {
    let state = stepAgenticLoop(initAgenticLoopState(), config, outcome({ validation: { valid: false, errors: ["Feld x fehlt"], confidence: 0 } }));
    const record = state.history[0];
    const event = buildReflectionFailedEvent("sess-01", record, state.reflectionContext);
    expect(event.payload.errors).toEqual(["Feld x fehlt"]);
    expect((event.payload.feedback as string[]).some((line) => line.includes("Feld x fehlt"))).toBe(true);
  });
});

describe("Telemetrie — Sequenz-Invarianten", () => {
  it("Single-Pass: start → iteration → validation:success → complete, Sequenz ok", () => {
    const events = runTracedLoop(() => outcome({}));
    expect(events.map((event) => event.event)).toEqual(["loop:start", "iteration:start", "validation:success", "loop:complete"]);
    expect(assertLoopEventSequence(events).ok).toBe(true);
    expect(events.map((event) => event.id)).toEqual([1, 2, 3, 4]);
  });

  it("Selbstkorrektur: Iteration 1 scheitert, Iteration 2 heilt — reflection:failed vor validation:success", () => {
    const events = runTracedLoop((iteration) =>
      iteration === 1 ? outcome({ validation: { valid: false, errors: ["x"], confidence: 0 } }) : outcome({}),
    );
    expect(events.map((event) => event.event)).toEqual([
      "loop:start",
      "iteration:start", "reflection:failed",
      "iteration:start", "validation:success",
      "loop:complete",
    ]);
    const check = assertLoopEventSequence(events);
    expect(check.ok).toBe(true);
    // Feedback aus Iteration 1 ist im Agent-Input von Iteration 2 angekommen
    const secondStart = events.find((event) => event.event === "iteration:start" && event.payload.iteration === 2);
    expect((secondStart?.payload.agentInput as string).length).toBeGreaterThan(0);
  });

  it("max_loops-Erschoepfung endet in loop:max_reached, nicht loop:complete", () => {
    const events = runTracedLoop(() => outcome({ validation: { valid: false, errors: ["x"], confidence: 0 } }));
    const names = events.map((event) => event.event);
    expect(names[names.length - 1]).toBe("loop:max_reached");
    expect(names).toHaveLength(1 + 3 * 2 + 1);
    expect(assertLoopEventSequence(events).ok).toBe(true);
  });

  it("Sequenz-Check entlarvt kaputte Streams (ohne Start, doppeltes Terminal)", () => {
    const events = runTracedLoop(() => outcome({}));
    expect(assertLoopEventSequence(events.slice(1)).ok).toBe(false); // start fehlt
    expect(assertLoopEventSequence([...events, events[events.length - 1]]).ok).toBe(false); // doppeltes Terminal
    expect(assertLoopEventSequence([]).ok).toBe(false);
  });
});

describe("Telemetrie-Bus — Verbindung & Isolation", () => {
  it("liefert Events nur an Abonnenten der SELBEN Session, nie quer", () => {
    const bus = new AgenticLoopTelemetryBus();
    const mine: AgenticLoopEvent[] = [];
    const other: AgenticLoopEvent[] = [];
    bus.subscribe("sess-A", (event) => mine.push(event));
    bus.subscribe("sess-B", (event) => other.push(event));

    bus.emit("sess-A", buildLoopStartEvent("sess-A", config, "A"));
    bus.emit("sess-B", buildIterationStartEvent("sess-B", 1, []));

    expect(mine.map((event) => event.event)).toEqual(["loop:start"]);
    expect(other.map((event) => event.event)).toEqual(["iteration:start"]);
    expect(mine[0].id).toBe(1);
    expect(other[0].id).toBe(1); // ID-Zaehler pro Session unabhaengig
  });

  it("subscribeWithReplay liefert verpasste Events lueckenlos und danach live weiter", () => {
    const bus = new AgenticLoopTelemetryBus();
    bus.emit("sess-R", buildLoopStartEvent("sess-R", config, "Reconnect"));
    bus.emit("sess-R", buildIterationStartEvent("sess-R", 1, []));
    // Disconnect: Abonnent verpasst Event 3
    bus.emit("sess-R", buildReflectionFailedEvent("sess-R", { iteration: 1, valid: false, confidence: 0, tokensUsed: 50, durationMs: 5, errors: ["x"], agentError: null }, ["Kontext"]));

    const received: AgenticLoopEvent[] = [];
    const { unsubscribe, replayed } = bus.subscribeWithReplay("sess-R", (event) => received.push(event), 2);
    expect(replayed.map((event) => event.id)).toEqual([3]);
    expect(received.map((event) => event.id)).toEqual([3]);

    bus.emit("sess-R", buildValidationSuccessEvent("sess-R", { iteration: 2, valid: true, confidence: 0.9, tokensUsed: 40, durationMs: 6, errors: [], agentError: null }, '{"ok":true}'));
    expect(received.map((event) => event.id)).toEqual([3, 4]); // nahtlos live
    unsubscribe();
    bus.emit("sess-R", buildIterationStartEvent("sess-R", 9, []));
    expect(received.map((event) => event.id)).toEqual([3, 4]); // abgemeldet = still
    expect(replayLoopEvents(bus.buffer("sess-R"), 2).map((event) => event.id)).toEqual([3, 4, 5]);
  });

  it("kaputter Handler wird isoliert entfernt — andere Abonnenten und Loop laufen weiter", () => {
    const bus = new AgenticLoopTelemetryBus();
    const healthy: AgenticLoopEvent[] = [];
    let brokenCalls = 0;
    bus.subscribe("sess-X", function broken() {
      brokenCalls += 1;
      throw new Error("Verbindung tot");
    });
    const second = bus.subscribe("sess-X", (event) => healthy.push(event));

    const first = bus.emit("sess-X", buildLoopStartEvent("sess-X", config, "X"));
    const secondEmit = bus.emit("sess-X", buildIterationStartEvent("sess-X", 1, []));
    expect(secondEmit).not.toBeNull();
    expect(brokenCalls).toBe(1); // nach dem ersten Wurf rausgeworfen
    expect(healthy.map((event) => event.id)).toEqual([1, 2]); // unbeeindruckt
    expect(bus.subscriberCount("sess-X")).toBe(1);
    second();
    expect(bus.subscriberCount("sess-X")).toBe(0);
  });

  it("ungueltige Session-IDs werden abgewiesen (kein Kanal, kein Event)", () => {
    const bus = new AgenticLoopTelemetryBus();
    expect(bus.emit("../etc/passwd", buildLoopStartEvent("../etc/passwd", config, "böse"))).toBeNull();
    expect(bus.buffer("../etc/passwd")).toHaveLength(0);
    expect(bus.subscriberCount("../etc/passwd")).toBe(0);
  });

  it("Ring-Puffer begrenzt den Speicher pro Session auf 240 Events", () => {
    const bus = new AgenticLoopTelemetryBus();
    for (let i = 0; i < 260; i++) {
      bus.emit("sess-BIG", buildIterationStartEvent("sess-BIG", i + 1, []));
    }
    const buffer = bus.buffer("sess-BIG");
    expect(buffer).toHaveLength(240);
    expect(buffer[0].id).toBe(21); // aelteste entfernt, IDs bleiben monoton
    expect(buffer[239].id).toBe(260);
  });
});

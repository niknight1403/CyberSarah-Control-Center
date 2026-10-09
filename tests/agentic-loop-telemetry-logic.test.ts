import { describe, expect, it, vi, afterEach } from "vitest";
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
import type { AgenticLoopConfig, AgenticLoopState, LoopIterationRecord } from "../lib/agentic-loop-logic";

afterEach(() => vi.restoreAllMocks());

const config = { maxLoops: 4, timeoutMs: 1000, maxTotalTokens: 2000, minConfidence: 0.8 } as AgenticLoopConfig;
const record = { iteration: 1, confidence: 0.9, tokensUsed: 42, durationMs: 12, errors: ["e"], agentError: "bad" } as LoopIterationRecord;
const state = (status: string): AgenticLoopState => ({ status, iteration: 2, confidence: 0.8, tokensUsed: 50, elapsedMs: 100, haltedReason: "done", lastOutput: "final" } as AgenticLoopState);

function event(id: number, name: AgenticLoopEvent["event"], iteration?: number): AgenticLoopEvent {
  return { id, sessionId: "sess-1", at: "2026-01-01T00:00:00.000Z", event: name, payload: iteration === undefined ? {} : { iteration } };
}

describe("agentic loop telemetry logic", () => {
  it("validates session ids against unsafe characters and length", () => {
    expect(isValidLoopSessionId("abcd_123-" )).toBe(true);
    expect(isValidLoopSessionId("abc")).toBe(false);
    expect(isValidLoopSessionId("abcd/../../x")).toBe(false);
    expect(isValidLoopSessionId("a".repeat(65))).toBe(false);
  });

  it("builds bounded start and iteration payloads with deterministic time", () => {
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    const start = buildLoopStartEvent("sess-1", config, "t".repeat(500));
    expect(start).toMatchObject({ event: "loop:start", at: "2026-01-02T03:04:05.000Z", payload: { task: "t".repeat(400), maxLoops: 4 } });
    const iter = buildIterationStartEvent("sess-1", 2, Array.from({ length: 14 }, (_, i) => `x${i}`));
    expect(iter.payload.reflectionContext).toHaveLength(12);
    expect(iter.payload.agentInput as string).toContain("x13");
    expect((iter.payload.agentInput as string).length).toBeLessThanOrEqual(600);
  });

  it("builds result and terminal events with bounded output", () => {
    expect(buildValidationSuccessEvent("sess-1", record, "o".repeat(500)).payload.outputPreview).toHaveLength(400);
    const failed = buildReflectionFailedEvent("sess-1", record, Array.from({ length: 14 }, (_, i) => `${i}`));
    expect(failed.payload.errors).toHaveLength(1);
    expect(failed.payload.feedback).toHaveLength(12);
    expect(buildTerminalEvent("sess-1", state("succeeded"))).toMatchObject({ event: "loop:complete", payload: { finalOutput: "final" } });
    expect(buildTerminalEvent("sess-1", state("failed"))).toMatchObject({ event: "loop:max_reached", payload: { finalOutput: null } });
  });

  it("replays only events after the requested id", () => {
    const events = [event(1, "loop:start"), event(2, "iteration:start", 1)];
    expect(replayLoopEvents(events, 1)).toEqual([events[1]]);
    expect(replayLoopEvents(events, 2)).toEqual([]);
  });

  it("accepts a valid sequence and reports ordering, pairing, and terminal violations", () => {
    const valid = [event(1, "loop:start"), event(2, "iteration:start", 1), event(3, "validation:success"), event(4, "loop:complete")];
    expect(assertLoopEventSequence(valid)).toEqual({ ok: true, problems: [] });
    const invalid = [event(1, "iteration:start", 2), event(2, "loop:start"), event(3, "iteration:start", 1), event(4, "loop:complete"), event(5, "reflection:failed")];
    const result = assertLoopEventSequence(invalid);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/Erstes Event|Ergebnisse|steigen|Terminal-Event muss/);
    expect(assertLoopEventSequence([]).problems).toContain("Event-Sequenz ist leer.");
  });
});

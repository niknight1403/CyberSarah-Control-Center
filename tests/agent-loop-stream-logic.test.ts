import { describe, expect, it } from "vitest";
import {
  appendLoopEvent,
  buildAgentLoopViewModel,
  deriveAgentLoopPhase,
  normalizeAgentLoopFrame,
  parseSseChunk,
  reconnectDelayMs,
  type AgentLoopStreamEvent,
} from "../lib/agent-loop-stream-logic";

const frame = (id: number, event: string, payload: Record<string, unknown>) =>
  `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify({ id, at: `2026-09-25T03:00:0${id}Z`, event, payload })}\n\n`;

describe("Agent-Loop-Stream — SSE-Parser", () => {
  it("parst vollstaendige Frames mit JSON-Daten und Heartbeat-Kommentaren", () => {
    const sse = `: stream verbunden\n\n${frame(1, "loop:start", { task: "Demo", maxLoops: 5 })}: ping 123\n\n${frame(2, "iteration:start", { iteration: 1 })}`;
    const { frames, rest } = parseSseChunk("", sse);
    expect(frames).toHaveLength(2);
    expect(frames[0].id).toBe(1);
    expect(frames[0].event).toBe("loop:start");
    expect((frames[0].data as Record<string, unknown>).payload).toEqual({ task: "Demo", maxLoops: 5 });
    expect(rest).toBe("");
  });

  it("ueberlebt zerrissene Frames ueber Chunk-Grenzen (Rest bleibt im Puffer)", () => {
    // Frame 1 komplett, Frame 2 in der Mitte durchschnitten
    const chunk1 = frame(1, "loop:start", { task: "X" }) + "id: 2\nevent: itera";
    const first = parseSseChunk("", chunk1);
    expect(first.frames).toHaveLength(1);
    expect(first.rest).toBe("id: 2\nevent: itera");
    const second = parseSseChunk(first.rest, "tion:start\ndata: " + JSON.stringify({ id: 2, at: "t", event: "iteration:start", payload: { iteration: 1 } }) + "\n\n");
    expect(second.frames).toHaveLength(1);
    expect(second.frames[0].event).toBe("iteration:start");
  });

  it("laesst Plaintext-Daten und unbekannte Events ehrlich durch (Filter erst danach)", () => {
    const { frames } = parseSseChunk("", "event: ping\ndata: hallo\n\n");
    expect(frames[0].data).toBe("hallo");
    expect(normalizeAgentLoopFrame(frames[0])).toBeNull(); // unbekannter Event-Name
    const noId = parseSseChunk("", "event: loop:start\ndata: {}\n\n");
    expect(normalizeAgentLoopFrame(noId.frames[0])).toBeNull(); // ohne id unbrauchbar
  });
});

describe("Agent-Loop-Stream — Dedupe & Backoff", () => {
  const ev = (id: number, event: AgentLoopStreamEvent["event"], payload: Record<string, unknown> = {}): AgentLoopStreamEvent => ({
    id, at: `t${id}`, event, payload,
  });

  it("appendLoopEvent dedupliziert Replay-Overlap und haelt IDs sortiert", () => {
    let events = [ev(1, "loop:start", { maxLoops: 3 })];
    events = appendLoopEvent(events, ev(1, "loop:start", { maxLoops: 3 })); // Replay-Duplikat
    expect(events).toHaveLength(1);
    events = appendLoopEvent(events, ev(3, "iteration:start", { iteration: 1 }));
    events = appendLoopEvent(events, ev(2, "loop:start"));
    expect(events.map((event) => event.id)).toEqual([1, 2, 3]); // sortiert trotz Ankunftsordnung
  });

  it("begrenzt den Puffer auf 240 Events (aechteste fliegen raus)", () => {
    let events: AgentLoopStreamEvent[] = [];
    for (let id = 1; id <= 245; id++) events = appendLoopEvent(events, ev(id, "iteration:start", { iteration: id }));
    expect(events).toHaveLength(240);
    expect(events[0].id).toBe(6);
    expect(events[239].id).toBe(245);
  });

  it("Backoff: 1s → 2s → 4s → 8s → 16s Deckel, deterministisch", () => {
    expect([1, 2, 3, 4, 5, 9, 0].map((attempt) => reconnectDelayMs(attempt))).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 16_000, 1_000]);
  });
});

describe("Agent-Loop-Stream — View-Model", () => {
  const ev = (id: number, event: AgentLoopStreamEvent["event"], payload: Record<string, unknown> = {}): AgentLoopStreamEvent => ({
    id, at: `t${id}`, event, payload,
  });

  it("leerer Stream: idle, wartender Zaehler, keine Konfidenz", () => {
    const view = buildAgentLoopViewModel([]);
    expect(view.phase).toBe("idle");
    expect(view.statusLabel).toBe("BEREIT");
    expect(view.iterationLabel).toBe("Warte auf ersten Durchlauf");
    expect(view.confidencePct).toBe(0);
    expect(view.terminal).toBe(false);
  });

  it("Live-Lauf: Iterationszaehler 'Iteration 2 von 5', Konfidenz aus letztem Messwert", () => {
    const events = [
      ev(1, "loop:start", { task: "Demo", maxLoops: 5, minConfidence: 0.7 }),
      ev(2, "iteration:start", { iteration: 1 }),
      ev(3, "reflection:failed", { iteration: 1, confidence: 0, errors: ["Feld x fehlt"] }),
      ev(4, "iteration:start", { iteration: 2, agentInput: "Kontext…" }),
      ev(5, "validation:success", { iteration: 2, confidence: 0.86, outputPreview: "{\"ok\":true}" }),
    ];
    const view = buildAgentLoopViewModel(events);
    expect(view.phase).toBe("validating");
    expect(view.iterationLabel).toBe("Iteration 2 von 5");
    expect(view.confidencePct).toBe(86);
    expect(view.terminal).toBe(false);
    expect(view.trail).toHaveLength(5);
    const failedEntry = view.trail.find((entry) => entry.label === "reflection:failed");
    expect(failedEntry?.kind).toBe("error");
    expect(failedEntry?.detail).toContain("Feld x fehlt");
  });

  it("Terminal: Erfolg friert Konfidenz ein; Abbruch markiert 'failed'", () => {
    const success = buildAgentLoopViewModel([
      ev(1, "loop:start", { maxLoops: 3 }),
      ev(2, "iteration:start", { iteration: 1 }),
      ev(3, "validation:success", { iteration: 1, confidence: 0.9 }),
      ev(4, "loop:complete", { status: "succeeded", iterations: 1, confidence: 0.9, totalTokens: 120 }),
    ]);
    expect(success.phase).toBe("success");
    expect(success.statusLabel).toBe("ERFOLG");
    expect(success.terminal).toBe(true);
    expect(success.trail[success.trail.length - 1].kind).toBe("success");

    const halted = buildAgentLoopViewModel([
      ev(1, "loop:start", { maxLoops: 2 }),
      ev(6, "loop:max_reached", { status: "halted_max_loops", iterations: 2, haltedReason: "max_loops erreicht (2)" }),
    ]);
    expect(halted.phase).toBe("failed");
    expect(halted.terminal).toBe(true);
    expect(halted.trail[halted.trail.length - 1].detail).toContain("max_loops erreicht");
  });

  it("Phase-Ableitung: erste Iteration 'thinking', spaetere 'reflecting'", () => {
    expect(deriveAgentLoopPhase([ev(1, "loop:start", {}), ev(2, "iteration:start", { iteration: 1 })])).toBe("thinking");
    expect(deriveAgentLoopPhase([ev(4, "iteration:start", { iteration: 2 })])).toBe("reflecting");
    expect(deriveAgentLoopPhase([ev(9, "reflection:failed", {})])).toBe("reflecting");
    expect(deriveAgentLoopPhase([])).toBe("idle");
  });

  it("Trail-Kappung: aelteste Einträge fliegen bei Ueberschreitung raus", () => {
    const events: AgentLoopStreamEvent[] = [];
    for (let id = 1; id <= 80; id++) events.push(ev(id, "iteration:start", { iteration: id }));
    const view = buildAgentLoopViewModel(events, 60);
    expect(view.trail).toHaveLength(60);
    expect(view.trail[0].id).toBe(21);
  });
});

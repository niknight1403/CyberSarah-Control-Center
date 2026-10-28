import { describe, expect, it } from "vitest";
import { normalizeAgentforgeEvent, verifyAgentforgeCheckpoint } from "../../server/agentforge-telemetry";

describe("Agentforge telemetry safety boundary", () => {
  it("keeps only metadata fields and rejects prompt-like event types", () => {
    const event = normalizeAgentforgeEvent({ id: "event-12345", type: "agent.failed", at: 1793160000000, taskId: 22, code: "TIMEOUT", answer: "private output" });
    expect(event?.metadata).toEqual({ taskId: 22, code: "TIMEOUT" });
    expect(normalizeAgentforgeEvent({ id: "event-12345", type: "thought", at: Date.now() })).toBeNull();
  });

  it("validates a hash-linked checkpoint and rejects sensitive fields", () => {
    expect(verifyAgentforgeCheckpoint({
      taskId: 12, agentId: 3, sequence: 1, parentId: null, checkpointId: "0".repeat(64),
      state: { status: "running", step: 2 },
    })).toBeNull();
    expect(verifyAgentforgeCheckpoint({
      taskId: 12, agentId: 3, sequence: 1, parentId: null, checkpointId: "a".repeat(64),
      state: { promptText: "must not persist" },
    })).toBeNull();
  });
});

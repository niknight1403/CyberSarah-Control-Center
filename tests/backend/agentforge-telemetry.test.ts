import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeAgentforgeEvent, verifyAgentforgeCheckpoint } from "../../server/agentforge-telemetry";

describe("Agentforge telemetry safety boundary", () => {
  it("keeps only metadata fields and rejects prompt-like event types", () => {
    const event = normalizeAgentforgeEvent({ id: "event-12345", type: "agent.failed", at: 1793160000000, taskId: 22, code: "TIMEOUT", answer: "private output" });
    expect(event?.metadata).toEqual({ taskId: 22, code: "TIMEOUT" });
    expect(normalizeAgentforgeEvent({ id: "event-12345", type: "thought", at: Date.now() })).toBeNull();
  });

  it("accepts an authentic hash-linked checkpoint and rejects forged or sensitive state", () => {
    const state = { status: "running", step: 2 };
    const checkpointId = createHash("sha256").update(["12", "3", "1", "", JSON.stringify(state)].join("\0")).digest("hex");
    expect(verifyAgentforgeCheckpoint({ taskId: 12, agentId: 3, sequence: 1, parentId: null, checkpointId, state })).toMatchObject({ checkpointId, taskId: "12", agentId: "3" });
    expect(verifyAgentforgeCheckpoint({ taskId: 12, agentId: 3, sequence: 1, parentId: null, checkpointId: "a".repeat(64), state: { promptText: "must not persist" } })).toBeNull();
  });
});

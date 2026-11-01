import { describe, expect, it } from "vitest";
import { deriveUltraAutopilotDecision } from "../lib/ultra-orchestrator-logic";

describe("ultra orchestrator decision policy", () => {
  it("heals real blockers before retrying or verifying", () => {
    const result = deriveUltraAutopilotDecision({
      blocked: ["Revenue relay offline"],
      deferred: ["LLM 429"],
      realActions: ["Draft erzeugt"],
    });
    expect(result.action).toBe("HEAL");
    expect(result.priority).toBe("critical");
  });

  it("retries transient provider work after cooldown", () => {
    const result = deriveUltraAutopilotDecision({
      blocked: [],
      deferred: ["Groq rate limited"],
      realActions: [],
    });
    expect(result.action).toBe("RETRY");
  });

  it("verifies completed real actions", () => {
    const result = deriveUltraAutopilotDecision({
      blocked: [],
      deferred: [],
      realActions: ["HARA-Live-Scan gestartet"],
    });
    expect(result.action).toBe("VERIFY");
  });

  it("observes when the system is quiet", () => {
    const result = deriveUltraAutopilotDecision({
      blocked: [],
      deferred: [],
      realActions: [],
    });
    expect(result.action).toBe("OBSERVE");
  });
});

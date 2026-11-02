import { describe, it, expect } from "vitest";
import { planAiInfluenzaAutopilot, type AiInfluenzaAutopilotCandidate } from "../lib/ai-influenza-autopilot-logic";

function candidate(over: Partial<AiInfluenzaAutopilotCandidate> = {}): AiInfluenzaAutopilotCandidate {
  return {
    jobId: 1, orderId: "order-1", step: "market-analysis", mode: "assisted",
    monthlyBudgetCents: 99900, testOnly: true, ...over,
  };
}

describe("AI Influenza Autopilot-Planung", () => {
  it("schaltet interne Schritte in Assisted ohne Freigabe weiter", () => {
    const result = planAiInfluenzaAutopilot({ orders: [candidate()] });
    expect(result.advanced).toBe(1);
    expect(result.waiting).toBe(0);
    expect(result.plans[0]).toMatchObject({ decision: "advance", from: "market-analysis", to: "target-research" });
  });

  it("haelt sensible Schritte an und nennt den Freigabe-Grund", () => {
    const result = planAiInfluenzaAutopilot({ orders: [candidate({ step: "approval" })] });
    const plan = result.plans[0];
    expect(result.advanced).toBe(0);
    expect(result.waiting).toBe(1);
    expect(plan.decision).toBe("wait");
    expect(plan.decision === "wait" ? plan.reason : "").toMatch(/Freigabe/i);
  });

  it("schaltet im Manual-Modus nichts weiter", () => {
    const result = planAiInfluenzaAutopilot({ orders: [candidate({ mode: "manual" })] });
    expect(result.advanced).toBe(0);
    expect(result.waiting).toBe(1);
  });

  it("meldet abgeschlossene Auftraege als final statt als Fehler", () => {
    const result = planAiInfluenzaAutopilot({ orders: [candidate({ step: "renewal" })] });
    expect(result.final).toBe(1);
    expect(result.advanced).toBe(0);
    expect(result.plans[0].decision).toBe("final");
  });

  it("respektiert das Lauf-Limit und laesst den Rest warten", () => {
    const orders = [candidate({ jobId: 1, orderId: "a" }), candidate({ jobId: 2, orderId: "b" })];
    const result = planAiInfluenzaAutopilot({ orders, maxAdvances: 1 });
    expect(result.advanced).toBe(1);
    expect(result.waiting).toBe(1);
  });

  it("liefert fuer eine leere Liste einen leeren Plan", () => {
    const result = planAiInfluenzaAutopilot({ orders: [] });
    expect(result.plans).toEqual([]);
    expect(result.advanced).toBe(0);
  });
});

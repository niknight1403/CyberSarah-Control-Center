import { describe, it, expect } from "vitest";
import { runAiInfluenzaAutopilotStep } from "../server/ai-influenza-autopilot";

function row(id: number, step: string, status = "queued") {
  return {
    id, status,
    order: { orderId: `order-${id}`, step, mode: "assisted", monthlyBudgetCents: 99900, testOnly: true },
  } as never;
}

describe("AI Influenza Autopilot-Schritt", () => {
  it("schaltet erlaubte Schritte und zaehlt wartende Auftraege", async () => {
    const calls: number[] = [];
    const result = await runAiInfluenzaAutopilotStep({
      listOrders: (async () => [row(1, "market-analysis"), row(2, "approval")]) as never,
      advanceOrder: (async ({ jobId }: { jobId: number }) => { calls.push(jobId); return {} as never; }) as never,
    });
    expect(calls).toEqual([1]);
    expect(result.considered).toBe(2);
    expect(result.advanced).toBe(1);
    expect(result.waiting).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("ignoriert abgeschlossene Auftraege", async () => {
    const result = await runAiInfluenzaAutopilotStep({
      listOrders: (async () => [row(9, "market-analysis", "completed")]) as never,
      advanceOrder: (async () => ({} as never)) as never,
    });
    expect(result.considered).toBe(0);
    expect(result.advanced).toBe(0);
  });

  it("isoliert Fehler eines Auftrags, ohne den Lauf zu beenden", async () => {
    let call = 0;
    const result = await runAiInfluenzaAutopilotStep({
      listOrders: (async () => [row(1, "market-analysis"), row(2, "market-analysis")]) as never,
      advanceOrder: (async () => {
        call += 1;
        if (call === 1) throw new Error("Datenbank nicht verfügbar.");
        return {} as never;
      }) as never,
    });
    expect(result.failed).toBe(1);
    expect(result.advanced).toBe(1);
    expect(result.error).toMatch(/Datenbank/);
  });
});

import { describe, expect, it, vi } from "vitest";
import { runControlCenterAutopilot } from "../server/control-center-autopilot";

describe("control center autopilot", () => {
  const revenue = vi.fn(async () => ({ status: "healthy" as const, generated: 2, skipped: [], opportunities: [] }));
  const drafts = vi.fn(async () => ({
    plan: [],
    generated: { content: 6, idea: 2, "revenue-loop": 1 },
    skipped: [],
  }));

  it("orchestriert echte Scans, Revenue und Drafts in einem Lauf", async () => {
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const result = await runControlCenterAutopilot({ scan, revenue, drafts });
    expect(scan).toHaveBeenCalledWith("hara/scan");
    expect(scan).toHaveBeenCalledWith("expansion/scan");
    expect(revenue).toHaveBeenCalledWith(5);
    expect(drafts).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.deferred).toEqual([]);
    expect(result.realActions.join(" ")).toContain("Creator-Content");
    expect(result.realActions.join(" ")).toContain("Revenue");
  });

  it("behandelt Provider-Quota ehrlich als verschobene Arbeit", async () => {
    const limitedDrafts = vi.fn(async () => ({ plan: [], generated: {}, skipped: [{ kind: "content" as const, reason: "LLM 429 Too Many Requests quota exceeded" }] }));
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const result = await runControlCenterAutopilot({ scan, revenue, drafts: limitedDrafts });
    expect(result.ok).toBe(false);
    expect(result.deferred.join(" ")).toContain("429");
    expect(result.blocked).toEqual([]);
  });

  it("meldet reale Blockaden statt sie als Erfolg zu simulieren", async () => {
    const scan = vi.fn()
      .mockRejectedValueOnce(new Error("Relay offline"))
      .mockResolvedValueOnce({ accepted: true, completed: false, background: true });
    const result = await runControlCenterAutopilot({ scan, revenue, drafts });
    expect(result.ok).toBe(false);
    expect(result.blocked.join(" ")).toContain("Relay offline");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/draft-engine", () => ({ runDraftEngine: vi.fn() }));
vi.mock("../server/revenue-autopilot", () => ({ runRevenueAutopilot: vi.fn() }));
vi.mock("../server/revenue-command-service", () => ({ triggerRevenueScan: vi.fn() }));

import { runDraftEngine } from "../server/draft-engine";
import { runRevenueAutopilot } from "../server/revenue-autopilot";
import { triggerRevenueScan } from "../server/revenue-command-service";
import { runControlCenterAutopilot } from "../server/control-center-autopilot";

describe("control center autopilot", () => {
  beforeEach(() => {
    vi.mocked(triggerRevenueScan).mockResolvedValue({ accepted: true, completed: false, background: true });
    vi.mocked(runRevenueAutopilot).mockResolvedValue({ status: "healthy", generated: 2, skipped: [], opportunities: [] });
    vi.mocked(runDraftEngine).mockResolvedValue({
      plan: [],
      generated: { content: 6, idea: 2, "revenue-loop": 1 },
      skipped: [],
    });
  });

  it("orchestriert echte Scans, Revenue und Drafts in einem Lauf", async () => {
    const result = await runControlCenterAutopilot();
    expect(triggerRevenueScan).toHaveBeenCalledWith("hara/scan");
    expect(triggerRevenueScan).toHaveBeenCalledWith("expansion/scan");
    expect(runRevenueAutopilot).toHaveBeenCalledWith(5);
    expect(runDraftEngine).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.realActions.join(" ")).toContain("Creator-Content");
    expect(result.realActions.join(" ")).toContain("Revenue");
  });

  it("meldet reale Blockaden statt sie als Erfolg zu simulieren", async () => {
    vi.mocked(triggerRevenueScan).mockRejectedValueOnce(new Error("Relay offline"));
    const result = await runControlCenterAutopilot();
    expect(result.ok).toBe(false);
    expect(result.blocked.join(" ")).toContain("Relay offline");
  });
});

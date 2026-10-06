import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAll, applyWrites, insertRecord, getMetrics } = vi.hoisted(() => ({
  listAll: vi.fn(),
  applyWrites: vi.fn(),
  insertRecord: vi.fn(),
  getMetrics: vi.fn(),
}));

vi.mock("../server/retrieval-metrics", () => ({ getRetrievalMetrics: getMetrics }));

import { setMemoryConsolidationDbForTests, runMemoryConsolidation } from "../server/memory-consolidation";

setMemoryConsolidationDbForTests({
  listAllAgentLearningsForConsolidation: listAll,
  applyConsolidationPlanWrites: applyWrites,
  insertMemoryConsolidationRecord: insertRecord,
});

describe("runMemoryConsolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAll.mockResolvedValue([
      { id: 1, kind: "preference", title: "Preferred format", detail: "Concise", keywords: "writing", createdAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    getMetrics.mockReturnValue({ samples: 12, hitRatePct: 75, avgInjections: 2.5 });
    applyWrites.mockResolvedValue(undefined);
    insertRecord.mockResolvedValue(undefined);
  });

  it("returns a dry-run preview without performing writes", async () => {
    const result = await runMemoryConsolidation("admin", { dryRun: true });

    expect(listAll).toHaveBeenCalledOnce();
    expect(applyWrites).not.toHaveBeenCalled();
    expect(insertRecord).not.toHaveBeenCalled();
    expect(result).toMatchObject({ applied: false, stats: { input: 1, survivors: 1 }, retrieval: { samples: 12, hitRatePct: 75, avgInjections: 2.5 } });
  });

  it("applies the plan then records its summary and metrics", async () => {
    const result = await runMemoryConsolidation("cron");

    expect(applyWrites).toHaveBeenCalledOnce();
    expect(insertRecord).toHaveBeenCalledWith(expect.objectContaining({
      trigger: "cron", inputCount: result.stats.input, survivorCount: result.stats.survivors,
      retrievalSamples: 12, retrievalHitRatePct: 75, summary: result.summary,
    }));
    expect(result.applied).toBe(true);
  });

  it("propagates write failures instead of reporting success", async () => {
    applyWrites.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(runMemoryConsolidation("admin")).rejects.toThrow("database unavailable");
    expect(insertRecord).not.toHaveBeenCalled();
  });
});

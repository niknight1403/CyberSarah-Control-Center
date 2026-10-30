import { describe, expect, it } from "vitest";
import { growthEvidenceFreshness, latestGrowthEvidence } from "../lib/growth-evidence-freshness";
describe("Sprint 17 – last observed evidence is not cron heartbeat", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("chooses the latest known source timestamp while ignoring malformed strings", () => {
    expect(latestGrowthEvidence(null, "invalid", new Date("2026-10-29T09:00:00Z"),
      "2026-10-30T11:00:00Z")).toBe("2026-10-30T11:00:00.000Z");
  });
  it("marks old evidence stale even if the server successfully restarted", () => {
    expect(growthEvidenceFreshness("2026-10-20T12:00:00Z", now).fresh).toBe(false);
    expect(growthEvidenceFreshness("2026-10-30T11:00:00Z", now).fresh).toBe(true);
  });
  it("does not treat missing or future timestamps as trustworthy", () => {
    expect(growthEvidenceFreshness(null, now).fresh).toBe(false);
    expect(growthEvidenceFreshness("2026-10-31T12:00:00Z", now).fresh).toBe(false);
  });
});

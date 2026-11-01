import { describe, expect, it } from "vitest";
import { zonedCampaignSlot } from "../lib/publishing-timezone-logic";
import { campaignToPlannedJobs } from "../lib/publishing-queue-logic";
import type { CampaignPlan } from "../lib/influencer-reach-logic";

describe("Publishing time zones and summer-time transitions", () => {
  it("keeps 09:00 Berlin time as DST starts in March", () => {
    const start = new Date("2026-03-28T12:00:00Z");
    expect(zonedCampaignSlot(start, 1, 9, "Europe/Berlin").toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(zonedCampaignSlot(start, 2, 9, "Europe/Berlin").toISOString()).toBe("2026-03-29T07:00:00.000Z");
    expect(zonedCampaignSlot(start, 3, 9, "Europe/Berlin").toISOString()).toBe("2026-03-30T07:00:00.000Z");
  });
  it("keeps 09:00 Berlin time when DST ends in October", () => {
    const start = new Date("2026-10-24T12:00:00Z");
    expect(zonedCampaignSlot(start, 1, 9, "Europe/Berlin").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(zonedCampaignSlot(start, 2, 9, "Europe/Berlin").toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
  it("rejects nonexistent wall clock times and invalid IANA zones", () => {
    const start = new Date("2026-03-28T12:00:00Z");
    expect(() => zonedCampaignSlot(start,2,2,"Europe/Berlin")).toThrow();
    expect(() => zonedCampaignSlot(start,1,9,"Unknown/Zone")).toThrow();
    expect(() => zonedCampaignSlot(start,0,9,"Europe/Berlin")).toThrow();
  });
  it("connects IANA scheduling to the existing campaign-to-job pipeline", () => {
    const plan = {product:"Testprodukt",goal:"wachstum",slots:[
      {day:1,persona:"nova",platform:"instagram"},
      {day:2,persona:"nova",platform:"instagram"},
    ]} as unknown as CampaignPlan;
    const jobs = campaignToPlannedJobs(plan, {
      startAt:new Date("2026-03-28T12:00:00Z"),
      slotOffsetHours:9,timeZone:"Europe/Berlin",
    });
    expect(jobs.map(j=>j.scheduledFor.toISOString())).toEqual([
      "2026-03-28T08:00:00.000Z","2026-03-29T07:00:00.000Z",
    ]);
  });
});

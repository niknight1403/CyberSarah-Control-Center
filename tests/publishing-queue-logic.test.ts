import { describe, expect, it } from "vitest";

import { planInfluencerCampaign } from "@/lib/influencer-reach-logic";
import {
  MAX_PUBLISH_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
  buildDedupeKey,
  campaignToPlannedJobs,
  isAutopilotEnabled,
  isJobDue,
  nextRetryAt,
  resolvePublishingMode,
} from "@/lib/publishing-queue-logic";

describe("publishing queue logic (Sprint 365)", () => {
  const plan = planInfluencerCampaign("Fitness-App fuer Zuhause", "wachstum", { days: 3 });

  it("ueberfuehrt Kampagnen-Slots in geplante Jobs mit Dedupe-Schluessel", () => {
    const jobs = campaignToPlannedJobs(plan, { startAt: new Date("2026-09-25T08:00:00Z") });
    expect(jobs.length).toBe(plan.slots.length);
    for (const job of jobs) {
      expect(job.dedupeKey).toBe(buildDedupeKey(job.product, job.persona, job.platform, job.campaignDay));
      expect(job.scheduledFor.getTime()).toBeGreaterThan(Date.parse("2026-09-24"));
    }
    const keys = new Set(jobs.map((job) => job.dedupeKey));
    expect(keys.size).toBe(jobs.length);
  });

  it("plant Slots deterministisch ab dem Startzeitpunkt", () => {
    const start = new Date("2026-09-25T22:45:00Z");
    const a = campaignToPlannedJobs(plan, { startAt: start });
    const b = campaignToPlannedJobs(plan, { startAt: start });
    expect(a).toEqual(b);
    expect(a[0].scheduledFor.getHours()).toBe(9); // Standard: 09:00 lokal
  });

  it("erkennt faellige Jobs nur im Status geplant und nach dem Zeitpunkt", () => {
    const due = new Date("2026-09-25T09:00:00Z");
    const after = new Date("2026-09-25T10:00:00Z");
    const before = new Date("2026-09-25T08:00:00Z");
    expect(isJobDue({ status: "geplant", scheduledFor: due }, after)).toBe(true);
    expect(isJobDue({ status: "geplant", scheduledFor: due }, before)).toBe(false);
    expect(isJobDue({ status: "veroeffentlicht", scheduledFor: due }, after)).toBe(false);
  });

  it("berechnet Retries mit Backoff und stoppt nach max. Versuchen", () => {
    const from = new Date("2026-09-25T09:00:00Z");
    expect(nextRetryAt(0, from)!.getTime()).toBe(from.getTime() + RETRY_BACKOFF_MINUTES[0] * 60_000);
    expect(nextRetryAt(1, from)!.getTime()).toBe(from.getTime() + RETRY_BACKOFF_MINUTES[1] * 60_000);
    expect(nextRetryAt(MAX_PUBLISH_ATTEMPTS, from)).toBeNull();
  });

  it("loest den Modus ehrlich auf: live nur mit Credentials, Sandbox mit Grund", () => {
    const live = resolvePublishingMode("x", { x: { token: "tok" } });
    expect(live.mode).toBe("live");

    const sandbox = resolvePublishingMode("x", {});
    expect(sandbox.mode).toBe("sandbox");
    expect(sandbox.reason).toContain("Kein X-Token");

    const ig = resolvePublishingMode("instagram", {});
    expect(ig.mode).toBe("sandbox");
    expect(ig.reason).toContain("mehrstufige Medien-Uploads");

    const li = resolvePublishingMode("linkedin", { linkedin: { token: "tok" } });
    expect(li.mode).toBe("sandbox");
    expect(li.reason).toContain("LinkedIn");
  });

  it("schaltet den Autopilot per Env-Flag aus", () => {
    expect(isAutopilotEnabled(undefined)).toBe(true);
    expect(isAutopilotEnabled("on")).toBe(true);
    expect(isAutopilotEnabled("off")).toBe(false);
  });

  it("baut stabile Dedupe-Keys unabhaengig von Gross-/Kleinschreibung", () => {
    expect(buildDedupeKey("  Fitness-APP ", "ava", "instagram", 1)).toBe(buildDedupeKey("fitness-app", "ava", "instagram", 1));
    expect(buildDedupeKey("A", "ava", "instagram", 1)).not.toBe(buildDedupeKey("A", "ava", "instagram", 2));
  });
});

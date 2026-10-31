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
  evaluatePublishingReliabilityCircuit,
  publishingFailureDecision,
  isStalePublishingClaim,
  STALE_PUBLISHING_CLAIM_MINUTES,
  PUBLISHING_STATUSES,
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

  it("loest den Modus ehrlich auf: live nur mit Credentials, Blockade mit Grund", () => {
    const live = resolvePublishingMode("x", { x: { token: "tok" } });
    expect(live.mode).toBe("live");

    const blocked = resolvePublishingMode("x", {});
    expect(blocked.mode).toBe("blocked");
    expect(blocked.reason).toContain("Kein x-Token");

    const li = resolvePublishingMode("linkedin", { linkedin: { token: "tok" } });
    expect(li.mode).toBe("blocked");
    expect(li.reason).toContain("LinkedIn");

    // Sprint 372: Bluesky (AT Protocol, kostenlos) als X-Alternative
  const bsFull = { bluesky: { token: "app-password", endpointUserId: "handle.bsky.social" } };
  expect(resolvePublishingMode("bluesky", bsFull).mode).toBe("live");
  expect(resolvePublishingMode("bluesky", {}).mode).toBe("blocked");
  expect(resolvePublishingMode("bluesky", {}).reason).toContain("BLUESKY");
  const bsNoHandle = resolvePublishingMode("bluesky", { bluesky: { token: "app-password" } });
  expect(bsNoHandle.mode).toBe("blocked");
  expect(bsNoHandle.reason).toContain("BLUESKY_IDENTIFIER");

  const th = resolvePublishingMode("threads", { threads: { token: "tok" } });
    expect(th.mode).toBe("blocked");
    expect(th.reason).toContain("Threads");
  });

  it("Medien-Plattformen (Sprint 366): live nur mit Token UND Asset", () => {
    const igCred = { instagram: { token: "tok", endpointUserId: "1789001" } };
    expect(resolvePublishingMode("instagram", igCred).mode).toBe("blocked"); // ohne Asset
    expect(resolvePublishingMode("instagram", igCred, { hasAsset: true }).mode).toBe("live");
    expect(resolvePublishingMode("instagram", igCred).reason).toContain("Asset-URL");

    const igNoUser = resolvePublishingMode("instagram", { instagram: { token: "tok" } }, { hasAsset: true });
    expect(igNoUser.mode).toBe("blocked");
    expect(igNoUser.reason).toContain("IG-User-ID");

    const ttCred = { tiktok: { token: "tok" } };
    expect(resolvePublishingMode("tiktok", ttCred, { hasAsset: true }).mode).toBe("live");
    expect(resolvePublishingMode("tiktok", ttCred).mode).toBe("blocked");
    expect(resolvePublishingMode("tiktok", {}).reason).toContain("TIKTOK_PUBLISH_TOKEN");
  });

  it("oeffnet den Publishing-Circuit nur bei einer klaren aktuellen Fehlerwelle", () => {
    expect(evaluatePublishingReliabilityCircuit({ published: 1, failed: 2 }).open).toBe(false);
    const open = evaluatePublishingReliabilityCircuit({ published: 2, failed: 3 });
    expect(open.open).toBe(true);
    expect(open.failureRatePct).toBe(60);
    expect(open.reason).toContain("Publishing pausiert");
    expect(evaluatePublishingReliabilityCircuit({ published: 8, failed: 2 }).open).toBe(false);
  });

  it("separates active and uncertain dispatch from due jobs", () => {
    const due=new Date("2026-01-01T00:00:00Z"),now=new Date("2026-01-02T00:00:00Z");
    expect(PUBLISHING_STATUSES).toContain("in_bearbeitung");
    expect(PUBLISHING_STATUSES).toContain("versand_ungeklaert");
    expect(isJobDue({status:"in_bearbeitung",scheduledFor:due},now)).toBe(false);
    expect(isJobDue({status:"versand_ungeklaert",scheduledFor:due},now)).toBe(false);
  });

  it("never automatically retries a possibly dispatched social post", () => {
    const now=new Date("2026-10-31T11:00:00Z");
    expect(publishingFailureDecision(true,1,now)).toEqual({status:"versand_ungeklaert",retryAt:null});
    expect(publishingFailureDecision(true,3,now)).toEqual({status:"versand_ungeklaert",retryAt:null});
    expect(publishingFailureDecision(false,1,now)).toEqual({status:"geplant",retryAt:nextRetryAt(1,now)});
    expect(publishingFailureDecision(false,3,now)).toEqual({status:"fehlgeschlagen",retryAt:null});
  });

  it("detects abandoned claims without expiring fresh workers", () => {
    const now=new Date("2026-10-31T11:00:00Z");
    expect(isStalePublishingClaim("in_bearbeitung",new Date(now.getTime()-(STALE_PUBLISHING_CLAIM_MINUTES+1)*60000),now)).toBe(true);
    expect(isStalePublishingClaim("in_bearbeitung",new Date(now.getTime()-5*60000),now)).toBe(false);
    expect(isStalePublishingClaim("geplant",new Date(0),now)).toBe(false);
  });

  it("schaltet den Autopilot per Env-Flag aus", () => {
    expect(isAutopilotEnabled(undefined)).toBe(true);
    expect(isAutopilotEnabled("on")).toBe(true);
    expect(isAutopilotEnabled("off")).toBe(false);
  });

  it("baut stabile Dedupe-Keys unabhaengig von Gross-/Kleinschreibung", () => {
    expect(buildDedupeKey("  Fitness-APP ", "lina", "instagram", 1)).toBe(buildDedupeKey("fitness-app", "lina", "instagram", 1));
    expect(buildDedupeKey("A", "lina", "instagram", 1)).not.toBe(buildDedupeKey("A", "lina", "instagram", 2));
  });
});

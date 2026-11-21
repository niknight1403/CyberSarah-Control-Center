import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateImageRequest } from "../lib/image-generation-logic";

describe("approved content production contract", () => {
  it("persists approved content and source draft identity", () => {
    const schema = readFileSync("drizzle/schema.ts", "utf8");
    const migration = readFileSync("drizzle/0026_approved_content_pipeline.sql", "utf8");
    expect(schema).toContain('contentOverride: text("content_override")');
    expect(schema).toContain('sourceDraftId: integer("source_draft_id")');
    expect(migration).toContain("publishing_jobs_source_draft_idx");
  });
  it("uses approved text and reconciles missed approvals", () => {
    const publishing = readFileSync("server/publishing-service.ts", "utf8");
    expect(publishing).toContain("job.contentOverride?.trim()");
    expect(publishing).toContain("approved-draft:");
    expect(readFileSync("server/draft-engine-router.ts", "utf8")).toContain("enqueueApprovedContentDraft");
    const decision = readFileSync("server/draft-engine.ts", "utf8");
    expect(decision).toContain("Dieser Content-Entwurf ist unvollständig oder nutzt eine nicht unterstützte Plattform");
    expect(decision.indexOf("Dieser Content-Entwurf ist unvollständig")).toBeLessThan(decision.indexOf(".update(draftQueue)"));
    expect(readFileSync("server/channel-autopilot.ts", "utf8")).toContain("reconcileApprovedContentDrafts");
    const reconciler = readFileSync("server/channel-autopilot.ts", "utf8");
    expect(reconciler).toContain('orderBy(sql`${draftQueue.decidedAt} ASC NULLS FIRST`,sql`${draftQueue.id} ASC`)');
    expect(reconciler).toContain('supported.has(platform)');
    expect(reconciler).toContain('content.length<10');
    expect(reconciler).toContain('users.openId');
    expect(reconciler).toContain('or(eq(users.openId,row.decidedBy),eq(users.email,row.decidedBy))');
    expect(reconciler).toContain('Legacy approved rows may predate the current publishing contract');
    const router = readFileSync("server/draft-engine-router.ts", "utf8");
    expect(router).toContain('const decidedBy = ctx.user.openId;');
    expect(readFileSync("server/publishing-service.ts", "utf8")).toContain('const platform = draft.platform.trim().toLowerCase();');
    expect(reconciler).not.toContain('replace("youtube/shorts","tiktok")');
  });
});
describe("publishing operations UI contract", () => {
  it("renders real failure causes and exposes only the controlled retry action", () => {
    const card = readFileSync("components/studio/publishing-ops-admin-card.tsx", "utf8");
    expect(card).toContain("stats.failureReasons.byCause.map");
    expect(card).toContain("stats.failureReasons.byPlatform.map");
    expect(card).toContain('retry.mutate()');
    expect(card).toContain("retry.data?.skipped.map");
    expect(card).toContain("stats.failureReasons.retryable===0");
  });
});
describe("publishing retry credential safety", () => {
  it("does not requeue auth failures without a successful supported token refresh", () => {
    const service = readFileSync("server/publishing-retry-service.ts", "utf8");
    expect(service).toContain('candidate?.platform !== "x"');
    expect(service).toContain('auth_ohne_automatische_token_erneuerung');
    expect(service).toContain('tokenRefresh?.ok !== true');
    expect(service).toContain('x_token_refresh_fehlgeschlagen');
  });
});
describe("publishing autopilot retry integration", () => {
  it("runs bounded classified retries before processing due jobs", () => {
    const service = readFileSync("server/publishing-service.ts", "utf8");
    const tick = service.indexOf("async function autopilotTick");
    const retry = service.indexOf("retryFailedJobsControlled({ limit: 25 })", tick);
    const due = service.indexOf("usersWithDueJobs()", tick);
    expect(retry).toBeGreaterThan(tick);
    expect(due).toBeGreaterThan(retry);
    expect(service).toContain("retry.skipped.length");
    const policy = readFileSync("lib/publishing-retry-logic.ts", "utf8");
    expect(policy).toContain("SYSTEM_RETRY_ATTEMPT_CAP = 3");
    expect(policy).toContain('AUTO_RETRYABLE_CAUSES: PublishingFailureCause[] = ["auth", "rate_limit", "network"]');
    expect(policy).toContain("provider_bereits_erreicht");
  });
});
describe("publishing retry safety contract", () => {
  it("uses bounded, tenant-scoped retry policy instead of resetting every failed job", () => {
    const router = readFileSync("server/publishing-router.ts", "utf8");
    const retryService = readFileSync("server/publishing-retry-service.ts", "utf8");
    const publishingService = readFileSync("server/publishing-service.ts", "utf8");
    expect(router).toContain('retryFailedJobsControlled({ userOpenId: ctx.user.openId })');
    expect(router).not.toContain('retryFailedPublishingJobs(ctx.user.openId)');
    expect(retryService).toContain('filters.push(eq(publishingJobs.userOpenId, userOpenId))');
    expect(retryService).toContain('attempts: rows.find((row) => row.id === entry.id)?.attempts ?? 0');
    expect(publishingService).toContain('attempts: 0');
    expect(retryService).toContain('planFailedJobRetries');
  });
});
describe("zero-cost media safety contract", () => {
  it("rejects unsafe prompts and retains local fallback", () => {
    expect(validateImageRequest({ prompt: "deepfake face swap of a celebrity" }).valid).toBe(false);
    const source = readFileSync("server/image-generation.ts", "utf8");
    const fn = source.indexOf("export async function generateImageForUser");
    expect(source.indexOf("validateImageRequest", fn)).toBeLessThan(source.indexOf("checkAndConsumeDailyQuota(openId)", fn));
    expect(source).toContain('source: "local"');
  });
  it("retains free ffmpeg and gradient video fallback", () => {
    const source = readFileSync("server/media-pipeline.ts", "utf8");
    expect(source).toContain('run("ffmpeg"');
    expect(source).toContain("gradientFallback");
  });
});

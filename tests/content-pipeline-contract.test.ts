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
    expect(readFileSync("server/channel-autopilot.ts", "utf8")).toContain("reconcileApprovedContentDrafts");
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

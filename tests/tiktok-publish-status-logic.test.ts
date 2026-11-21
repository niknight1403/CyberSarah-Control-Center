import { describe, expect, it } from "vitest";
import { resolveTikTokPublishStatus } from "../lib/tiktok-publish-status-logic";

describe("TikTok publish status", () => {
  it("does not treat publish initialization as publication", () => {
    expect(resolveTikTokPublishStatus({ error: { code: "ok" }, data: { status: "PROCESSING_DOWNLOAD" } }, "pub-1"))
      .toEqual({ state: "pending" });
  });

  it("returns a receipt only after PUBLISH_COMPLETE", () => {
    expect(resolveTikTokPublishStatus({
      error: { code: "ok" },
      data: { status: "PUBLISH_COMPLETE", publicly_available_post_id: ["12345"] },
    }, "pub-1")).toEqual({ state: "complete", externalId: "12345" });
  });

  it("uses the provider publish id for completed non-public posts", () => {
    expect(resolveTikTokPublishStatus({
      error: { code: "ok" }, data: { status: "PUBLISH_COMPLETE", publicly_available_post_id: [] },
    }, "pub-1")).toEqual({ state: "complete", externalId: "tiktok-publish:pub-1" });
  });

  it("surfaces terminal provider failures", () => {
    expect(resolveTikTokPublishStatus({
      error: { code: "ok" }, data: { status: "FAILED", fail_reason: "video_pull_failed" },
    }, "pub-1")).toEqual({ state: "failed", reason: "video_pull_failed" });
  });

  it("rejects provider API errors", () => {
    expect(() => resolveTikTokPublishStatus({ error: { code: "invalid_publish_id" } }, "pub-1"))
      .toThrow("invalid_publish_id");
  });
});

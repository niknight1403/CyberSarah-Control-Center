import { describe, expect, it } from "vitest";
import { assertPublishingMediaUrls, reviewPublishingMediaUrl } from "../lib/publishing-asset-url-logic";

describe("Public publishing asset URL release gate", () => {
  it("accepts HTTPS public CDN names and recognized image/video formats", () => {
    expect(reviewPublishingMediaUrl("https://cdn.example.com/campaign/post.webp?size=1080")).toEqual({valid:true,type:"image"});
    expect(reviewPublishingMediaUrl("https://media.example.com/reel.mp4")).toEqual({valid:true,type:"video"});
    expect(() => assertPublishingMediaUrls("https://cdn.example.com/a.png",["https://cdn.example.com/b.jpg"])).not.toThrow();
  });

  it.each([
    "http://cdn.example.com/reel.mp4",
    "http://127.0.0.1/reel.mp4",
    "https://127.0.0.1/media.png",
    "https://localhost/media.png",
    "https://192.168.1.50/private.mp4",
    "https://[::1]/asset.png",
    "https://internal.local/screenshot.png",
    "https://metadata.internal/asset.jpg",
    "https://example.com:8443/media.jpg",
    "https://user:pass@example.com/media.jpg",
    "https://cdn.example.com/image.png#fragment",
    "data:image/png;base64,a",
    "https://cdn.example.com/private-key.txt",
  ])("blocks insecure, private, misleading or non-media URL: %s", value => {
    expect(reviewPublishingMediaUrl(value).valid).toBe(false);
    expect(() => assertPublishingMediaUrls(value)).toThrow();
  });

  it("rejects video URLs in image carousels even if the HTTPS URL itself is valid", () => {
    expect(() => assertPublishingMediaUrls(undefined, ["https://cdn.example.com/a.png","https://cdn.example.com/b.mp4"])).toThrow(/Bilder/);
  });

  it("enforces an absolute maximum of ten carousel URLs", () => {
    expect(() => assertPublishingMediaUrls(null, Array.from({length:11},(_,i)=>`https://cdn.example.com/${i}.jpg`))).toThrow(/zehn/);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildReviewableProductReel,
  validateReelStoryboard,
  type ReelStoryboardScene,
} from "../lib/reel-storyboard-logic";

const scene = (startSeconds: number, endSeconds: number): ReelStoryboardScene => ({
  startSeconds, endSeconds,
  voiceover: "Ein kurzer, neutraler Sprechertext.",
  subtitles: "Ein neutraler Untertitel",
  visual: "Produktkarte",
});

describe("Sprint 32 – validated product Reel storyboard", () => {
  it("produces contiguous scenes with duration, voiceover and readable subtitles", () => {
    const result = buildReviewableProductReel("CyberSarah Digitalpaket");
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    expect(result.durationSeconds).toBe(27);
    expect(result.scenes.map(s => [s.startSeconds, s.endSeconds])).toEqual([
      [0, 3], [3, 11], [11, 21], [21, 27],
    ]);
    expect(result.content).toMatch(/Sprechertext:/);
    expect(result.content).toMatch(/Untertitel:/);
    expect(result.content).toContain("CyberSarah Digitalpaket");
    expect(result.content).toContain("kein gerendertes Video oder Audio");
    expect(result.content).not.toMatch(/79[.,]00|garantierte Wirkung|jetzt kaufen/i);
    expect(validateReelStoryboard(result.scenes).ok).toBe(true);
  });

  it("fails closed on gaps, overlaps and scenes longer than 30 seconds", () => {
    expect(validateReelStoryboard([scene(0, 3), scene(4, 12), scene(12, 25)]).ok).toBe(false);
    expect(validateReelStoryboard([scene(0, 3), scene(2, 11), scene(11, 25)]).ok).toBe(false);
    expect(validateReelStoryboard([scene(0, 3), scene(3, 11), scene(11, 31)]).ok).toBe(false);
  });

  it("refuses missing voiceover and unreadably fast subtitles", () => {
    const missing = [scene(0, 3), scene(3, 11), scene(11, 27)];
    missing[0].voiceover = " ";
    expect(validateReelStoryboard(missing).ok).toBe(false);
    const fastCaption = [scene(0, 3), scene(3, 11), scene(11, 27)];
    fastCaption[0].subtitles = "X".repeat(67);
    expect(validateReelStoryboard(fastCaption).ok).toBe(false);
    const fastSpeech = [scene(0, 3), scene(3, 11), scene(11, 27)];
    fastSpeech[0].voiceover = "eins zwei drei vier fünf sechs sieben acht neun zehn";
    expect(validateReelStoryboard(fastSpeech).ok).toBe(false);
  });

  it("sanitizes product-name line breaks and rejects unusably long product names", () => {
    const result = buildReviewableProductReel("CyberSarah\nDigitalpaket");
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    expect(result.scenes[0].visual).toContain("CyberSarah Digitalpaket");
    expect(buildReviewableProductReel(" ".repeat(5)).ok).toBe(false);
    expect(buildReviewableProductReel("X".repeat(201)).ok).toBe(false);
  });
});

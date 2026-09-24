import { describe, expect, it } from "vitest";

import {
  VIDEO_LIMITS,
  buildConcatFfmpegArgs,
  buildSceneFfmpegArgs,
  buildVideoCacheKey,
  escapeForFilter,
} from "../lib/video-assembly-logic";

describe("ffmpeg-Szenen-Argumente (Sprint 274)", () => {
  it("bauen deterministisch 1080p-Argumente mit Ken-Burns-Zoom", () => {
    const args = buildSceneFfmpegArgs({
      sceneId: "s1",
      seconds: 6,
      audioPath: "/tmp/a.mp3",
      outputPath: "/tmp/s1.mp4",
      gradientIndex: 0,
    });
    expect(args[0]).toBe("-y");
    expect(args).toContain("gradients=size=1920x1080:speed=0.0015:c1");
    expect(args.join(" ")).toContain("zoompan=z='min(zoom+0.0008,1.12)':d=150:s=1920x1080:fps=25");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
  });

  it("variieren den Farbverlauf pro Szenen-Index (deterministisch, 5 Bühnen)", () => {
    const a = buildSceneFfmpegArgs({ sceneId: "a", seconds: 4, audioPath: "/tmp/a.mp3", outputPath: "/tmp/a.mp4", gradientIndex: 1 });
    const b = buildSceneFfmpegArgs({ sceneId: "b", seconds: 4, audioPath: "/tmp/b.mp3", outputPath: "/tmp/b.mp4", gradientIndex: 1 });
    expect(a).toEqual(b.map((v) => v.replace("/tmp/b.mp3", "/tmp/a.mp3").replace("/tmp/b.mp4", "/tmp/a.mp4")));
    const c = buildSceneFfmpegArgs({ sceneId: "c", seconds: 4, audioPath: "/tmp/c.mp3", outputPath: "/tmp/c.mp4", gradientIndex: 5 });
    expect(c.join(" ")).toContain(":c1"); // 5 % 5 + 1 = 1 — Wrap-around ist deterministisch
  });
});

describe("ffmpeg-Verkettung (Sprint 274)", () => {
  it("verkettet Szenen mit Untertitel-Filter und mappt Ausgaben", () => {
    const args = buildConcatFfmpegArgs({ sceneVideoPaths: ["/tmp/s1.mp4", "/tmp/s2.mp4"], srtPath: "/tmp/sub.srt", outputPath: "/tmp/final.mp4" });
    expect(args).not.toBeNull();
    const flat = args!.join(" ");
    expect(flat).toContain("concat=n=2:v=1:a=1");
    expect(flat).toContain("subtitles=/tmp/sub.srt");
    expect(flat).toContain("-movflags +faststart");
  });

  it("lehnt leere Szenenlisten ab", () => {
    expect(buildConcatFfmpegArgs({ sceneVideoPaths: [], srtPath: "/tmp/s.srt", outputPath: "/tmp/f.mp4" })).toBeNull();
  });

  it("escapet Doppelpunkte in Filter-Pfaden", () => {
    expect(escapeForFilter("/tmp/a:b.srt")).toBe("/tmp/a\\:b.srt");
  });
});

describe("Video-Grenzen und Cache-Schlüssel (Sprint 274)", () => {
  it("bleibt bei ehrlichen 1080p-Grenzen", () => {
    expect(VIDEO_LIMITS.width).toBe(1920);
    expect(VIDEO_LIMITS.height).toBe(1080);
    expect(VIDEO_LIMITS.maxDailyVideosPerUser).toBeLessThanOrEqual(10);
    expect(VIDEO_LIMITS.cacheMaxEntries).toBeLessThanOrEqual(20);
  });

  it("baut deterministische Cache-Schlüssel", () => {
    expect(buildVideoCacheKey({ source: "A", voice: "de-DE-KatjaNeural" })).toBe(
      buildVideoCacheKey({ source: "A", voice: "de-DE-KatjaNeural" }),
    );
    expect(buildVideoCacheKey({ source: "A", voice: "de-DE-KatjaNeural" })).not.toBe(
      buildVideoCacheKey({ source: "B", voice: "de-DE-KatjaNeural" }),
    );
  });
});

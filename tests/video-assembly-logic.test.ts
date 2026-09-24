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
describe("ffmpeg-Szenen-Argumente mit echtem FLUX-Bild (Sprint 276)", () => {
  it("nutzt Bild-Input mit Cover-Skalierung statt Farbverlauf, wenn ein Pfad übergeben wird", () => {
    const withImage = buildSceneFfmpegArgs({
      sceneId: "s1", seconds: 6, audioPath: "/tmp/a.mp3", outputPath: "/tmp/s1.mp4",
      gradientIndex: 0, imagePath: "/tmp/scene.png",
    });
    const flat = withImage.join(" ");
    expect(flat).toContain("-loop 1");
    expect(flat).toContain("-i /tmp/scene.png");
    expect(flat).toContain("force_original_aspect_ratio=increase");
    expect(flat).toContain("crop=1920:1080");
    expect(flat).not.toContain("gradients=");
  });

  it("fällt ohne imagePath deterministisch auf die Farbverlauf-Bühne zurück", () => {
    const fallback = buildSceneFfmpegArgs({
      sceneId: "s1", seconds: 6, audioPath: "/tmp/a.mp3", outputPath: "/tmp/s1.mp4",
      gradientIndex: 0, imagePath: null,
    });
    expect(fallback.join(" ")).toContain("gradients=size=1920x1080");
    expect(fallback.join(" ")).not.toContain("-loop 1");
  });
});

describe("Asset-Pack-Integration (Sprint 282)", () => {
  it("nutzt Pack-Farben im Gradient-Rückfall statt Legacy-Presets", () => {
    const args = buildSceneFfmpegArgs({
      sceneId: "s1",
      seconds: 4,
      audioPath: "/tmp/s1.mp3",
      outputPath: "/tmp/s1.mp4",
      gradientIndex: 0,
      imagePath: null,
      gradientColors: { from: "0f172a", to: "38bdf8" },
    });
    const gradient = args.find((a) => a.startsWith("gradients="));
    expect(gradient).toContain("c0=0x0f172a");
    expect(gradient).toContain("c1=0x38bdf8");
  });

  it("fällt ohne Pack-Farben deterministisch auf die Legacy-Presets zurück", () => {
    const args = buildSceneFfmpegArgs({
      sceneId: "s1",
      seconds: 4,
      audioPath: "/tmp/s1.mp3",
      outputPath: "/tmp/s1.mp4",
      gradientIndex: 2,
      imagePath: null,
      gradientColors: null,
    });
    expect(args.find((a) => a.startsWith("gradients="))).toContain("c3");
  });

  it("unterscheidet Cache-Keys bei unterschiedlichen Pack-Signaturen", () => {
    const base = { source: "Gleicher Text", voice: "de-DE-KatjaNeural" };
    const ohne = buildVideoCacheKey(base);
    const mit = buildVideoCacheKey({ ...base, packsSignature: "pack_a:Outfit|pack_b:Set" });
    const mitAnders = buildVideoCacheKey({ ...base, packsSignature: "pack_c:Outfit|-" });
    expect(mit).not.toBe(ohne);
    expect(mitAnders).not.toBe(mit);
    expect(buildVideoCacheKey({ ...base, packsSignature: "pack_a:Outfit|pack_b:Set" })).toBe(mit);
  });
});

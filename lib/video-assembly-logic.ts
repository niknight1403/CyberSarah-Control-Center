/**
 * Sprint 274 — Video-Assembly-Logik (rein, testbar). Portiert aus
 * projekt-nullpunkt (server/media.ts KenBurnsFallback + server/assembly.ts):
 * 1080p-MP4 aus Szenen-Audio mit synthetischen Ken-Burns-Hintergründen
 * (ffmpeg lavfi gradients — keine externen Bilder nötig) plus eingebrannten
 * SRT-Untertiteln.
 *
 * Ehrlichkeits-Regeln:
 *   - Die ffmpeg-Argumente werden rein gebaut und getestet; der Prozess-Aufruf
 *     bleibt eine dünne Hülle in server/media-pipeline.ts.
 *   - Fehlt ffmpeg in der Laufzeitumgebung, ist Video ehrlich "nicht verfügbar"
 *     — kein stilles Audio-only-Resultat, das sich als Video ausgibt.
 *   - Farbverlauf-Hintergründe sind bewusst als synthetische Ersatzbühne
 *     gekennzeichnet; echte FLUX-Bilder pro Szene sind eine spätere Stufe.
 */

export const VIDEO_LIMITS = {
  width: 1920,
  height: 1080,
  fps: 25,
  /** Maximale Gesamtdauer eines Videos (Sekunden) — ehrlich begrenzt. */
  maxTotalSeconds: 90,
  maxVideoBytes: 24 * 1024 * 1024,
  cacheMaxEntries: 12,
  maxDailyVideosPerUser: 6,
} as const;

/**
 * Baut die ffmpeg-Argumente für EINE Szene: Farbverlauf-Hintergrund mit
 * Ken-Burns-Zoom + Erzähl-Audio, Normalisierung auf 1080p/25fps.
 * Rein und deterministisch — identische Szene ergibt identische Argumente.
 */
export function buildSceneFfmpegArgs(input: {
  sceneId: string;
  seconds: number;
  audioPath: string;
  outputPath: string;
  gradientIndex: number;
}): string[] {
  const { seconds, audioPath, outputPath, gradientIndex } = input;
  const gradient = `gradients=size=${VIDEO_LIMITS.width}x${VIDEO_LIMITS.height}:speed=0.0015:c${(gradientIndex % 5) + 1}`;
  const zoompan = `zoompan=z='min(zoom+0.0008,1.12)':d=${Math.max(1, Math.round(seconds * VIDEO_LIMITS.fps))}:s=${VIDEO_LIMITS.width}x${VIDEO_LIMITS.height}:fps=${VIDEO_LIMITS.fps}`;
  return [
    "-y",
    "-f", "lavfi",
    "-i", gradient,
    "-i", audioPath,
    "-t", String(Math.max(1, seconds)),
    "-vf", zoompan,
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    outputPath,
  ];
}

/** Baut die Argumente für den finalen Concat (Szenen-Videos + Untertitel). */
export function buildConcatFfmpegArgs(input: {
  sceneVideoPaths: string[];
  srtPath: string;
  outputPath: string;
}): string[] | null {
  const { sceneVideoPaths, srtPath, outputPath } = input;
  if (sceneVideoPaths.length === 0) return null;
  const filterParts = sceneVideoPaths.map((_, index) => `[${index}:v]scale=${VIDEO_LIMITS.width}:${VIDEO_LIMITS.height}[v${index}]`).join(";");
  const joinParts = sceneVideoPaths.map((_, index) => `[v${index}][${index}:a]`).join("");
  const concatIn = sceneVideoPaths.map((_, index) => `[${index}:a]aresample=48000[a${index}]`).join(";");
  const filterComplex = [
    filterParts,
    concatIn,
    `${joinParts}concat=n=${sceneVideoPaths.length}:v=1:a=1[vc][ac]`,
    `[vc]subtitles=${escapeForFilter(srtPath)}[vout]`,
  ].join(";");
  return [
    "-y",
    ...sceneVideoPaths.flatMap((path) => ["-i", path]),
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[ac]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ];
}

/** ffmpeg-Filterwerte escapen (Doppelpunkte etc. im Dateipfad). */
export function escapeForFilter(value: string): string {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export type VideoCapabilityProbe =
  | { available: true; version: string }
  | { available: false; reason: string };

export interface VideoAssembler {
  /** Rendert EINE Szene (Video-Pfad bei Erfolg). */
  renderScene(args: { audioPath: string; seconds: number; sceneId: string; gradientIndex: number; outputPath: string }): Promise<
    | { ok: true }
    | { ok: false; reason: string }
  >;
  /** Verkettet Szenen mit Untertiteln zum finalen Video. */
  concat(input: { sceneVideoPaths: string[]; srtPath: string; outputPath: string }): Promise<
    | { ok: true }
    | { ok: false; reason: string }
  >;
}

export function buildVideoCacheKey(input: { source: string; voice: string }): string {
  let hash = 2166136261;
  const payload = `${input.voice}::${input.source}`;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `video:${(hash >>> 0).toString(36)}`;
}

export interface VideoCacheEntry {
  base64Mp4: string;
  bytes: number;
  createdAt: string;
  sceneCount: number;
  totalSeconds: number;
}

export interface VideoCacheAdapter {
  get(key: string): Promise<VideoCacheEntry | null>;
  set(key: string, entry: VideoCacheEntry): Promise<void>;
}

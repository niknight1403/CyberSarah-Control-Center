/**
 * Beweis: aus einem freigegebenen AI-Influenza-Video-Paket entsteht eine
 * abspielbare MP4 — mit den Szenen-Zeiten und Untertiteln des Pakets.
 *
 * Bewusst ohne TTS: die Tonspur ist Stille. Damit wird die Assembly
 * (Szenen -> ffmpeg -> Concat -> SRT) geprueft, nicht die Sprachsynthese.
 * Fehlt ffmpeg oder libass, sagt das Skript das und faellt nicht auf einen
 * gruenen Schein zurueck.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  approveAiInfluenzaVideoPackage,
  buildAiInfluenzaVideoPackage,
} from "../lib/ai-influenza-video-package-logic";
import { buildConcatFfmpegArgs, buildSceneFfmpegArgs } from "../lib/video-assembly-logic";

const FIXTURE_SCRIPT = [
  "Wir bauen Content, der Kunden bringt. ||| Nahaufnahme: Kalender mit geplanten Posts",
  "Zwoelf Kurzvideos pro Monat, ohne Agentur-Overhead. ||| Split-Screen: Team vs. Solo-Creator",
  "Jedes Video mit Skript, Untertiteln und Freigabe. ||| Bildschirm: Storyboard im Dashboard",
  "Starter ab 299 Euro monatlich, jederzeit kuendbar. ||| Logo und Preis-Card",
].join("\n");

function ffmpegAvailable(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function libassAvailable(): boolean {
  try {
    const out = execFileSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
    return / subtitles /.test(out);
  } catch {
    return false;
  }
}

function probeDurationSeconds(file: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" },
  );
  return Number.parseFloat(out.trim());
}

const releaseLabel = process.argv[2]?.trim() || "2026-11-02";
const orderId = `release-v${releaseLabel}`;

function main(): void {
  if (!ffmpegAvailable()) {
    console.error("FAIL: ffmpeg fehlt in dieser Umgebung — kein Render-Nachweis moeglich.");
    process.exit(1);
  }
  const withSubs = libassAvailable();
  console.log(`ffmpeg vorhanden · libass/Untertitel: ${withSubs ? "ja" : "nein (Untertitel nur als SRT-Datei)"}`);

  const built = buildAiInfluenzaVideoPackage({
    orderId: orderId,
    taskLabel: `Kurzvideo Release ${releaseLabel}`,
    script: FIXTURE_SCRIPT,
  });
  const blocked = built.notes.filter((note) => note.startsWith("Paket unvollstaendig") || note.includes("ueberschreitet"));
  if (blocked.length > 0) throw new Error(`Paket nicht renderbar: ${blocked.join("; ")}`);
  const approved = approveAiInfluenzaVideoPackage(built, {
    approvedBy: "ci-render-proof",
    approvedAt: "2026-11-02T03:00:00.000Z",
  });
  console.log(`Paket freigegeben: ${approved.scenes.length} Szenen, ${approved.durationSeconds}s, Status ${approved.status}`);

  const dir = mkdtempSync(path.join(tmpdir(), "influenza-reel-"));
  const silent = path.join(dir, "silence.mp3");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-t", String(approved.durationSeconds), "-q:a", "9", silent], { stdio: "ignore" });

  const palette = ["0x101a2e", "0x1d1233", "0x0d2430", "0x241226"];
  const sceneFiles = approved.scenes.map((scene, index) => {
    const out = path.join(dir, `scene-${index + 1}.mp4`);
    // Szenenbild statt Gradient-Quelle: der lavfi-Filter "gradients" gibt es
    // erst ab ffmpeg 6, der CI-Runner hat 5.x.
    const still = path.join(dir, `scene-${index + 1}.png`);
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=${palette[index % palette.length]}:s=1920x1080`,
      "-frames:v", "1", still], { stdio: "ignore" });
    const args = buildSceneFfmpegArgs({
      sceneId: `scene-${index + 1}`,
      seconds: scene.endSeconds - scene.startSeconds,
      audioPath: silent,
      outputPath: out,
      gradientIndex: index,
      imagePath: still,
    });
    execFileSync("ffmpeg", ["-y", ...args], { stdio: "ignore" });
    if (statSync(out).size < 1000) throw new Error(`Szene ${index + 1} ist leer gerendert.`);
    return out;
  });
  console.log(`Szenen gerendert: ${sceneFiles.length}`);

  const srtPath = path.join(dir, "subtitles.srt");
  writeFileSync(srtPath, approved.subtitlesSrt, "utf8");
  const output = path.join(dir, "ai-influenza-reel.mp4");
  const concatArgs = buildConcatFfmpegArgs({ sceneVideoPaths: sceneFiles, srtPath, outputPath: output });
  if (!concatArgs) throw new Error("Concat-Argumente konnten nicht gebaut werden.");
  try {
    execFileSync("ffmpeg", concatArgs, { stdio: "ignore" });
  } catch (error) {
    if (withSubs) throw error;
    const fallback = concatArgs.filter((part) => !String(part).includes("subtitles="));
    execFileSync("ffmpeg", fallback, { stdio: "ignore" });
    console.log("Hinweis: Concat ohne eingebrannte Untertitel gelaufen.");
  }

  const size = statSync(output).size;
  const seconds = probeDurationSeconds(output);
  if (size < 10_000) throw new Error(`MP4 zu klein (${size} Bytes) — kein echtes Video.`);
  if (Math.abs(seconds - approved.durationSeconds) > 1.5)
    throw new Error(`MP4-Dauer ${seconds}s weicht vom Paket (${approved.durationSeconds}s) ab.`);
  const header = readFileSync(output).subarray(4, 8).toString("ascii");
  if (header !== "ftyp") throw new Error("Datei ist kein MP4-Container.");
  const keep = process.argv[3]?.trim();
  if (keep) {
    mkdirSync(keep, { recursive: true });
    copyFileSync(output, path.join(keep, `ai-influenza-reel-v${releaseLabel}.mp4`));
    copyFileSync(srtPath, path.join(keep, `ai-influenza-reel-v${releaseLabel}.srt`));
    console.log(`Artefakte kopiert nach ${keep}`);
  }
  console.log(`PASS: MP4 gerendert (${(size / 1024).toFixed(0)} KB, ${seconds.toFixed(2)}s, SRT ${approved.subtitlesSrt.split("\n").filter(Boolean).length} Zeilen), publishingTriggered=${approved.publishingTriggered}.`);
}

main();

/**
 * AI Influenza Team — Content-Paket bauen (Sprint 9b).
 *
 * Aus einem Paket-Skript entsteht eine fertige MP4: pro Szene eine Vertonung
 * (Gemini TTS, OpenAI als Rueckfall) und ein Bildmotiv, danach Montage ueber
 * die bestehende Assembly. Fehlt ein Schluessel, wird das Paket trotzdem
 * gebaut — aber mit Stille und Farbflaechen, und das Manifest sagt es klar.
 *
 * Aufruf: tsx scripts/build-ai-influenza-content-package.ts [paket] [zielordner]
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildSrt,
  buildAiInfluenzaVideoPackage,
  approveAiInfluenzaVideoPackage,
} from "../lib/ai-influenza-video-package-logic";
import type { ReelStoryboardScene } from "../lib/reel-storyboard-logic";
import {
  buildMotifPrompt,
  buildMotifRequest,
  buildTtsRequest,
  explainMissingVoice,
  parseMotifImage,
  parseTtsAudio,
  pcm16ToWav,
  resolveImageKeys,
  resolveVoiceTargets,
  retryDelayMs,
  shouldRetryStatus,
  type VoiceTarget,
} from "../lib/ai-influenza-voice-logic";
import { buildMotifPpm, paletteFor } from "../lib/ai-influenza-motif-logic";
import {
  canStartMediaRun,
  initialKeyState,
  isKeyUsable,
  mediaKeyId,
  observeMediaAttempt,
  summarizeMediaKeys,
  type MediaKeyState,
} from "../lib/media-key-quarantine-logic";
import { buildConcatFfmpegArgs, buildSceneFfmpegArgs } from "../lib/video-assembly-logic";

/**
 * Laufweite Quarantaene je Media-Schluessel.
 *
 * Ein 401 antwortet auch bei Szene 12 noch mit 401. Frueher wurde der Schluessel
 * trotzdem fuer jede Szene erneut probiert: der Lauf wurde langsam, die
 * Fehlerliste unlesbar und die eigentliche Lage (nur noch ein gesunder
 * Schluessel) unsichtbar. Jetzt gilt: einmal tote Schluessel werden uebersprungen.
 */
const mediaStates = new Map<string, MediaKeyState>();

function mediaStateFor(apiKey: string, source: string): MediaKeyState {
  const keyId = mediaKeyId(apiKey);
  const existing = mediaStates.get(keyId);
  if (existing) return existing;
  const created = initialKeyState({ apiKey, source });
  mediaStates.set(keyId, created);
  return created;
}

function recordMediaAttempt(
  reference: { apiKey: string; source: string } | undefined,
  status: number | null,
  retryAfterSeconds?: number | null,
): void {
  if (!reference) return;
  const current = mediaStateFor(reference.apiKey, reference.source);
  mediaStates.set(current.keyId, observeMediaAttempt(current, { status, now: Date.now(), retryAfterSeconds }));
}

function isUsableNow(apiKey: string, source: string): boolean {
  return isKeyUsable(mediaStateFor(apiKey, source), Date.now());
}

const SCRIPTS: Record<string, string> = {
  starter: [
    "Jeden Monat zwoelf Kurzvideos, fertig zum Posten. ||| Kalender mit geplanten Posts",
    "Skript, Untertitel und Freigabe kommen vom Team. ||| Storyboard im Dashboard",
    "Sie geben frei, wir liefern. ||| Handy mit Freigabe-Button",
    "Starter ab 299 Euro monatlich, jederzeit kuendbar. ||| Preiskarte mit Starter-Paket",
  ].join("\n"),
  growth: [
    "Content, der Kunden bringt, statt nur Reichweite. ||| Diagramm mit steigender Linie",
    "Zwoelf Kurzvideos plus zwanzig Posts pro Monat. ||| Split-Screen: Team bei der Arbeit",
    "Jedes Stueck mit Skript, Untertiteln und Freigabe. ||| Nahaufnahme eines Skripts",
    "Growth ab 999 Euro monatlich, monatlicher Report inklusive. ||| Report-Ausschnitt mit Zahlen",
  ].join("\n"),
};

function ffmpegReady(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function libassAvailable(): boolean {
  try {
    return / subtitles /.test(execFileSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }));
  } catch {
    return false;
  }
}

function probeSeconds(file: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" },
  );
  return Number.parseFloat(out.trim());
}

/**
 * Anfrage mit Wiederholung: 429 und 5xx sind kein Endzustand. Retry-After des
 * Anbieters wird respektiert, sonst waechst die Pause (2s, 6s, 14s).
 */
async function fetchWithRetry(
  request: { url: string; headers: Record<string, string>; body: string },
  label: string,
  attempts = 3,
  keyRef?: { apiKey: string; source: string },
): Promise<Response | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(request.url, { method: "POST", headers: request.headers, body: request.body });
    const retryAfterRaw = Number(response.headers.get("retry-after") ?? "");
    recordMediaAttempt(keyRef, response.status, Number.isFinite(retryAfterRaw) ? retryAfterRaw : null);
    if (response.ok) return response;
    const retryable = shouldRetryStatus(response.status);
    const last = attempt === attempts - 1;
    if (!retryable || last) {
      console.log(`  ${label}: HTTP ${response.status}${retryable ? " (Versuche erschoepft)" : ""} — wechsle Quelle.`);
      return null;
    }
    const retryAfter = Number(response.headers.get("retry-after") ?? "");
    const wait = retryDelayMs(attempt, Number.isFinite(retryAfter) ? retryAfter : null);
    console.log(`  ${label}: HTTP ${response.status}, neuer Versuch in ${(wait / 1000).toFixed(0)}s.`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return null;
}

/** Holt die Vertonung einer Szene; geht die Anbieterkette entlang, bis einer liefert. */
async function synthesizeSceneVoice(
  targets: VoiceTarget[],
  text: string,
  workDir: string,
  index: number,
): Promise<{ file: string; source: string; seconds: number } | null> {
  for (const target of targets) {
    // Quarantaenierte Schluessel werden in diesem Lauf nicht erneut probiert.
    if (!isUsableNow(target.apiKey, target.provider)) continue;
    const request = buildTtsRequest(target, text);
    const response = await fetchWithRetry(request, `Szene ${index + 1} ${target.provider}`, 3, {
      apiKey: target.apiKey,
      source: target.provider,
    });
    if (!response) continue;

    const contentType = response.headers.get("content-type") ?? "";
    const payload: unknown = contentType.includes("application/json")
      ? await response.json()
      : { __bytes: new Uint8Array(await response.arrayBuffer()) };
    const audio = parseTtsAudio(target, payload);
    if (!audio) {
      console.log(`  Szene ${index + 1}: ${target.provider} liefert keine Audiodaten (${contentType}).`);
      continue;
    }

    const file = path.join(workDir, `scene-${index + 1}-voice.${audio.container === "mp3" ? "mp3" : "wav"}`);
    if (audio.container === "mp3") {
      const rawPath = path.join(workDir, `scene-${index + 1}.mp3`);
      writeFileSync(rawPath, audio.bytes);
      execFileSync("ffmpeg", ["-y", "-i", rawPath, file], { stdio: "ignore" });
    } else {
      writeFileSync(file, pcm16ToWav(audio.bytes, audio.sampleRate, audio.channels));
    }
    const seconds = probeSeconds(file);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    return { file, source: target.provider, seconds };
  }
  return null;
}

/** Erzeugt das Bildmotiv; ohne Kontingent bleibt es beim Markenmotiv. */
async function buildSceneMotif(
  keys: string[],
  prompt: string,
  workDir: string,
  index: number,
  packageId: string,
): Promise<{ file: string; source: string }> {
  const output = path.join(workDir, `scene-${index + 1}.png`);
  for (const key of keys) {
    if (!isUsableNow(key, "gemini-image")) continue;
    try {
      const response = await fetchWithRetry(buildMotifRequest(key, prompt), `Szene ${index + 1} Motiv`, 3, {
        apiKey: key,
        source: "gemini-image",
      });
      if (!response) continue;
      const image = parseMotifImage(await response.json());
      if (!image) continue;
      writeFileSync(output, image);
      if (statSync(output).size > 5000) return { file: output, source: "gemini-image" };
    } catch (error) {
      console.log(`  Szene ${index + 1}: Motiv fehlgeschlagen (${(error as Error).message}).`);
    }
  }
  // Kein Bilddienst: Markenmotiv aus reiner Rechnung, kein leeres Farbfeld.
  const ppmPath = path.join(workDir, `scene-${index + 1}.ppm`);
  writeFileSync(ppmPath, buildMotifPpm({ width: 1080, height: 1920, palette: paletteFor(packageId), sceneIndex: index }));
  execFileSync("ffmpeg", ["-y", "-i", ppmPath, "-frames:v", "1", output], { stdio: "ignore" });
  return { file: output, source: "brand-gradient" };
}

async function main(): Promise<void> {
  const packageId = (process.argv[2] ?? "growth").trim();
  const outDir = path.resolve(process.argv[3] ?? "artifacts/content-package");
  const script = SCRIPTS[packageId];
  if (!script) throw new Error(`Unbekanntes Paket "${packageId}" — erlaubt: ${Object.keys(SCRIPTS).join(", ")}.`);
  if (!ffmpegReady()) {
    console.error("FAIL: ffmpeg/ffprobe fehlt — kein Render moeglich.");
    process.exit(1);
  }

  const built = buildAiInfluenzaVideoPackage({
    orderId: `content-package-${packageId}-${Date.now()}`,
    taskLabel: `Content-Paket ${packageId}`,
    script,
  });
  const blocked = built.notes.filter((note) => note.startsWith("Paket unvollstaendig") || note.includes("ueberschreitet"));
  if (blocked.length > 0) throw new Error(`Paket nicht renderbar: ${blocked.join("; ")}`);
  const approved = approveAiInfluenzaVideoPackage(built, {
    approvedBy: "content-package-builder",
    approvedAt: new Date().toISOString(),
  });

  const voiceTargets = resolveVoiceTargets(process.env);
  const imageKeys = resolveImageKeys(process.env);
  const voiceTarget = voiceTargets[0] ?? null;
  console.log(`Paket ${packageId}: ${approved.scenes.length} Szenen`);
  console.log(`Vertonung: ${voiceTarget ? voiceTarget.provider : "keine"} · Motive: ${imageKeys.length > 0 ? "gemini, sonst Markenmotiv" : "Markenmotiv"}`);
  if (!voiceTarget) console.log(`Hinweis: ${explainMissingVoice(process.env)}`);

  // Schluessel beim Start registrieren, damit die Quarantaene ab Szene 1 greift.
  for (const target of voiceTargets) mediaStateFor(target.apiKey, target.provider);
  for (const key of imageKeys) mediaStateFor(key, "gemini-image");
  const keyStates = Array.from(mediaStates.values());
  const runGuard = canStartMediaRun(keyStates, Date.now());
  if (!runGuard.allowed) {
    const configured = keyStates.length > 0;
    const message = `Media-Lage: ${runGuard.reason}`;
    if (configured || process.env.REQUIRE_COMPLETE_PACKAGE === "1") {
      // Schluessel sind vorhanden, aber keiner liefert: stilles Weitermachen
      // wuerde ein Paket ohne Stimme als fertig ausliefern.
      console.error(`FAIL: ${message}`);
      process.exit(1);
    }
    console.log(`Hinweis: ${message} (Trockenlauf ohne Schluessel bleibt gruen.)`);
  }
  const voiceTargetsUsable = voiceTargets.filter((target) => isUsableNow(target.apiKey, target.provider));

  const workDir = mkdtempSync(path.join(tmpdir(), `content-${packageId}-`));
  const manifestScenes: {
    index: number;
    voiceover: string;
    visual: string;
    seconds: number;
    voiceSource: string;
    motifSource: string;
  }[] = [];

  // Schritt 1: Stimme und Motiv je Szene, Laenge aus der echten Sprachdauer.
  const prepared: { index: number; seconds: number; audioPath: string; imagePath: string; scene: ReelStoryboardScene; voiceSource: string; motifSource: string }[] = [];
  for (const [index, scene] of approved.scenes.entries()) {
    const voice = await synthesizeSceneVoice(voiceTargetsUsable, scene.voiceover, workDir, index);
    const planned = scene.endSeconds - scene.startSeconds;
    // Szenenlaenge folgt der echten Sprachdauer, damit kein Wort abgeschnitten wird.
    const seconds = voice ? Math.max(2, Math.ceil(voice.seconds + 0.3)) : planned;
    let audioPath = voice?.file ?? path.join(workDir, `scene-${index + 1}-silence.mp3`);

    if (voice) {
      // Auf die volle Szenenlaenge auffuellen: sonst kuerzt -shortest das Bild.
      const padded = path.join(workDir, `scene-${index + 1}-voice-pad.mp3`);
      execFileSync("ffmpeg", ["-y", "-i", audioPath, "-af", "apad", "-t", String(seconds), padded], { stdio: "ignore" });
      audioPath = padded;
    } else {
      execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-t", String(seconds), "-q:a", "9", audioPath], { stdio: "ignore" });
    }

    const motif = await buildSceneMotif(
      imageKeys,
      buildMotifPrompt({ visual: scene.visual, sceneIndex: index, packageName: packageId }),
      workDir,
      index,
      packageId,
    );

    prepared.push({
      index,
      seconds,
      audioPath,
      imagePath: motif.file,
      scene,
      voiceSource: voice?.source ?? "silence",
      motifSource: motif.source,
    });
  }

  // Schritt 2: Zeitfenster neu setzen (echte Sprachdauer) und SRT daraus bauen.
  let cursor = 0;
  const scenes = prepared.map((entry) => {
    const scene: ReelStoryboardScene = {
      ...entry.scene,
      startSeconds: cursor,
      endSeconds: cursor + entry.seconds,
    };
    cursor += entry.seconds;
    return scene;
  });
  const totalSeconds = cursor;
  console.log(`Szenenlaengen: ${prepared.map((entry) => entry.seconds).join("s, ")}s · gesamt ${totalSeconds}s`);

  // Schritt 3: Szenen rendern und montieren.
  const sceneFiles = prepared.map((entry, index) => {
    const output = path.join(workDir, `scene-${index + 1}.mp4`);
    const args = buildSceneFfmpegArgs({
      sceneId: `scene-${index + 1}`,
      seconds: entry.seconds,
      audioPath: entry.audioPath,
      outputPath: output,
      gradientIndex: index,
      imagePath: entry.imagePath,
    });
    execFileSync("ffmpeg", ["-y", ...args], { stdio: "ignore" });
    if (statSync(output).size < 1000) throw new Error(`Szene ${index + 1} ist leer gerendert.`);
    manifestScenes.push({
      index: index + 1,
      voiceover: entry.scene.voiceover,
      visual: entry.scene.visual,
      seconds: entry.seconds,
      voiceSource: entry.voiceSource,
      motifSource: entry.motifSource,
    });
    return output;
  });

  const srtPath = path.join(workDir, "subtitles.srt");
  const srt = buildSrt(scenes);
  writeFileSync(srtPath, srt, "utf8");

  const videoPath = path.join(workDir, "content-package.mp4");
  const concatArgs = buildConcatFfmpegArgs({ sceneVideoPaths: sceneFiles, srtPath, outputPath: videoPath });
  if (!concatArgs) throw new Error("Concat-Argumente konnten nicht gebaut werden.");
  const withSubs = libassAvailable();
  try {
    execFileSync("ffmpeg", concatArgs, { stdio: "ignore" });
  } catch (error) {
    if (withSubs) throw error;
    const fallback = concatArgs.filter((part) => !String(part).includes("subtitles="));
    execFileSync("ffmpeg", fallback, { stdio: "ignore" });
    console.log("Hinweis: Untertitel liegen nur als SRT vor (kein libass).");
  }

  const size = statSync(videoPath).size;
  const seconds = probeSeconds(videoPath);
  if (size < 20_000) throw new Error(`MP4 zu klein (${size} Bytes) — kein echtes Video.`);
  if (readFileSync(videoPath).subarray(4, 8).toString("ascii") !== "ftyp") throw new Error("Datei ist kein MP4-Container.");
  if (Math.abs(seconds - totalSeconds) > 1.5) throw new Error(`MP4-Dauer ${seconds}s weicht von ${totalSeconds}s ab.`);

  mkdirSync(outDir, { recursive: true });
  const stem = `content-package-${packageId}`;
  copyFileSync(videoPath, path.join(outDir, `${stem}.mp4`));
  copyFileSync(srtPath, path.join(outDir, `${stem}.srt`));
  writeFileSync(
    path.join(outDir, `${stem}.json`),
    JSON.stringify(
      {
        packageId,
        orderId: approved.orderId,
        status: approved.status,
        publishingTriggered: approved.publishingTriggered,
        durationSeconds: Number(seconds.toFixed(2)),
        voiceProvider: voiceTarget?.provider ?? null,
        // Was wirklich im Paket steckt, nicht was geplant war.
        voiceScenes: manifestScenes.filter((scene) => scene.voiceSource !== "silence").length,
        motifScenes: manifestScenes.filter((scene) => scene.motifSource === "gemini-image").length,
        motifProvider: manifestScenes.some((scene) => scene.motifSource === "gemini-image")
          ? "gemini-image"
          : "brand-gradient",
        scenes: manifestScenes,
        // Schluessel-Lage im Paket: belegt, welcher Anbieter tatsaechlich trug
        // und ob ein Schluessel waehrend des Laufs ausgefallen ist.
        mediaKeys: summarizeMediaKeys(Array.from(mediaStates.values())),
        notes: approved.notes,
      },
      null,
      2,
    ),
    "utf8",
  );

  const withVoice = manifestScenes.filter((scene) => scene.voiceSource !== "silence").length;
  const withMotif = manifestScenes.filter((scene) => scene.motifSource === "gemini-image").length;
  const summary =
    `${stem}.mp4 (${(size / 1024).toFixed(0)} KB, ${seconds.toFixed(2)}s), ` +
    `${withVoice}/${manifestScenes.length} Szenen vertont, ${withMotif}/${manifestScenes.length} mit generiertem Motiv, ` +
    `publishingTriggered=${approved.publishingTriggered}`;

  // Ein halb vertontes Paket ist kein Erfolg. In der CI muss das rot werden.
  const requiresComplete = process.env.REQUIRE_COMPLETE_PACKAGE === "1";
  const complete = withVoice === manifestScenes.length;
  if (!complete && requiresComplete) {
    console.error(`FAIL: ${summary}`);
    console.error(`Unvollstaendig: ${manifestScenes.length - withVoice} Szene(n) ohne Stimme. Ursache pruefen statt gruen winken.`);
    process.exit(1);
  }
  const keySummary = summarizeMediaKeys(Array.from(mediaStates.values()));
  if (keySummary.quarantined > 0) {
    console.log(
      `Hinweis: ${keySummary.quarantined} Media-Schluessel als ungueltig gesperrt (${keySummary.invalidSources.join(", ") || "unbekannt"}). ` +
        "Schluessel erneuern, sonst traegt der Lauf auf dem letzten gesunden Schluessel.",
    );
  }
  console.log(`PASS: ${summary}`);
  if (!complete) console.log("Hinweis: Paket ohne vollstaendige Vertonung — lokal gebaut, nicht als fertig gemeldet.");
}

main().catch((error) => {
  console.error(`FAIL: ${(error as Error).message}`);
  process.exit(1);
});

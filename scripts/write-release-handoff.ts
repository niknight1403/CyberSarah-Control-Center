import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildReleaseHandoff } from "../lib/release-handoff-logic";

/**
 * Schreibt das Release-Handoff-Artefakt (Sprint 49): Der Release-Preflight
 * erzeugt aus Conventional Commits ein redigiertes Changelog und haengt es
 * an das Handoff-Artefakt an. Commits stammen aus `git log` oder der
 * Umgebungsvariable RELEASE_COMMIT_SUBJECTS (JSON-Array).
 *
 *   RELEASE_COMMIT_SUBJECTS='["feat: a", "fix: b"]' \
 *     npx tsx scripts/write-release-handoff.ts
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readCommitSubjects(): string[] {
  const override = env("RELEASE_COMMIT_SUBJECTS");
  if (override !== undefined) {
    try {
      const parsed: unknown = JSON.parse(override);
      if (Array.isArray(parsed) && parsed.every((subject) => typeof subject === "string")) {
        return parsed;
      }
    } catch {
      // Faelle unten deterministisch behandeln
    }
    throw new Error("RELEASE_COMMIT_SUBJECTS muss ein JSON-Array aus Zeichenketten sein.");
  }
  const git = spawnSync("git", ["log", "--format=%s", "-n", "200"], { encoding: "utf8" });
  if (git.status !== 0 || typeof git.stdout !== "string") {
    return [];
  }
  return git.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}

async function main(): Promise<void> {
const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
  name?: unknown;
  version?: unknown;
};

const handoff = buildReleaseHandoff(
  {
    preflight: {
      appName: env("RELEASE_APP_NAME") ?? (typeof packageJson.name === "string" ? packageJson.name : ""),
      version: env("RELEASE_VERSION") ?? (typeof packageJson.version === "string" ? packageJson.version : ""),
      androidPackage: env("RELEASE_ANDROID_PACKAGE") ?? "",
      orientation: env("RELEASE_ORIENTATION") ?? "portrait",
      buildCommand: env("RELEASE_BUILD_COMMAND") ?? "npm run build",
    },
    commitSubjects: readCommitSubjects(),
    metadata: {
      repository: env("GITHUB_REPOSITORY") ?? "local",
      ref: env("GITHUB_REF_NAME") ?? "local",
      commit: env("GITHUB_SHA") ?? "local",
      runId: env("GITHUB_RUN_ID") ?? "local",
      runAttempt: env("GITHUB_RUN_ATTEMPT") ?? "1",
      status: env("CI_STATUS") ?? "unknown",
    },
  },
  new Date().toISOString(),
);

const output = resolve(process.env.RELEASE_HANDOFF_OUTPUT ?? "release-handoff.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
console.log(`Release handoff written to ${output}`);
console.log(
  handoff.changelog
    ? `Changelog angehaengt (${handoff.changelog.entryCount} Eintraege).`
    : `Kein Changelog: ${handoff.changelogIssue}`,
);
}

void main();

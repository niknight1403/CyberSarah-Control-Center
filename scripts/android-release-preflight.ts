#!/usr/bin/env tsx
/**
 * Use only in local/CI release preflight, after set-release-version.
 * Never prints secret values or complete source-file content.
 *
 * npx tsx scripts/android-release-preflight.ts 2.7.2
 * ANDROID_RELEASE_REQUIRE_SIGNING=1 npx tsx scripts/android-release-preflight.ts 2.7.2
 */
import { readFileSync } from "node:fs";
import {
  missingAndroidSigningSecrets, validateAndroidReleaseSources,
} from "../lib/android-release-preflight-logic";

function run(): void {
  const requestedVersion = process.argv[2] ?? "";
  const files = {
    capacitorConfig: "capacitor.config.ts",
    androidGradle: "android/app/build.gradle",
    expoConfig: "app.config.ts",
    manifest: "android/app/src/main/AndroidManifest.xml",
  } as const;

  let sources: Record<keyof typeof files, string>;
  try {
    sources = {
      capacitorConfig: readFileSync(files.capacitorConfig, "utf8"),
      androidGradle: readFileSync(files.androidGradle, "utf8"),
      expoConfig: readFileSync(files.expoConfig, "utf8"),
      manifest: readFileSync(files.manifest, "utf8"),
    };
  } catch {
    console.error("ANDROID-RELEASE-GATE: mandatory Android source/config file missing.");
    process.exitCode = 1;
    return;
  }

  const failures = validateAndroidReleaseSources(sources, requestedVersion);
  if (process.env.ANDROID_RELEASE_REQUIRE_SIGNING === "1") {
    const missing = missingAndroidSigningSecrets(process.env);
    if (missing.length) failures.push(`Signing prerequisites missing: ${missing.join(", ")}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`ANDROID-RELEASE-GATE: ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("ANDROID-RELEASE-GATE: package identity, version, manifest and signing prerequisites OK.");
}

run();

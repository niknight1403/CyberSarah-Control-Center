#!/usr/bin/env node
import fs from "node:fs";

const version = process.argv[2]?.trim();
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Usage: node scripts/set-release-version.mjs MAJOR.MINOR.PATCH");
}

const [major, minor, patchWithMeta] = version.split(".");
const patch = Number(patchWithMeta.split(/[+-]/, 1)[0]);
const versionCode = Number(major) * 10_000 + Number(minor) * 100 + patch;
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error("Version produces an invalid Android versionCode.");

const appConfigPath = "app.config.ts";
const appConfig = fs.readFileSync(appConfigPath, "utf8");
const updatedConfig = appConfig.replace(/(\n\s*version:\s*)"[^"]+"/, `$1"${version}"`);
if (!/\n\s*version:\s*"[^"]+"/.test(appConfig)) throw new Error("Could not locate Expo version in app.config.ts.");
fs.writeFileSync(appConfigPath, updatedConfig);

const gradlePath = "android/app/build.gradle";
const gradle = fs.readFileSync(gradlePath, "utf8");
const updatedGradle = gradle
  .replace(/(\n\s*versionCode\s+)\d+/, `$1${versionCode}`)
  .replace(/(\n\s*versionName\s+)["'][^"']+["']/, `$1"${version}"`);
if (!/\n\s*versionCode\s+\d+/.test(gradle) || !/\n\s*versionName\s+["'][^"']+["']/.test(gradle)) {
  throw new Error("Could not locate Android version fields.");
}
fs.writeFileSync(gradlePath, updatedGradle);

console.log(`Release version set to ${version} (versionCode ${versionCode}).`);

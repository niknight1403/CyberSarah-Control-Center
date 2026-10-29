import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/android-release-preflight.ts");
const tsxExecutable = resolve("node_modules/.bin/tsx");

function runFixture(extraEnv: Record<string, string> = {}, withWrongPackage = false) {
  const root = mkdtempSync(join(tmpdir(), "cs-android-preflight-"));
  try {
    mkdirSync(join(root, "android/app/src/main"), { recursive: true });
    writeFileSync(join(root, "capacitor.config.ts"), 'appId: "com.cybersarah.controlcenter"');
    writeFileSync(join(root, "android/app/build.gradle"), [
      'applicationId "' + (withWrongPackage ? "com.bad.package" : "com.cybersarah.controlcenter") + '"',
      "versionCode 20702", 'versionName "2.7.2"',
    ].join("\n"));
    writeFileSync(join(root, "app.config.ts"), 'const rawBundleId = "com.cybersarah.controlcenter";\nversion: "2.7.2"');
    writeFileSync(join(root, "android/app/src/main/AndroidManifest.xml"),
      '<manifest><activity android:exported="true"/><uses-permission android:name="android.permission.INTERNET"/></manifest>');

    return spawnSync(tsxExecutable, [script, "2.7.2"], {
      cwd: root, encoding: "utf8", timeout: 15_000,
      env: { ...process.env, ANDROID_RELEASE_REQUIRE_SIGNING: "0", ...extraEnv },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Android preflight executable", () => {
  it("passes with a consistent Android/Expo identity", () => {
    const result = runFixture();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ANDROID-RELEASE-GATE");
  });
  it("fails closed on wrong package name", () => {
    const result = runFixture({}, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Gradle package ID mismatch");
  });
  it("keeps signing values out of diagnostics", () => {
    const result = runFixture({ ANDROID_RELEASE_REQUIRE_SIGNING: "1",
      ANDROID_KEYSTORE_BASE64: "", ANDROID_KEYSTORE_PASSWORD: "super-secret-test-marker",
      ANDROID_KEY_ALIAS: "", ANDROID_KEY_PASSWORD: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Signing prerequisites missing");
    expect(result.stderr).not.toContain("super-secret-test-marker");
  });
});

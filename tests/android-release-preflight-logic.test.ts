import { describe, expect, it } from "vitest";
import {
  androidVersionCode, missingAndroidSigningSecrets, validateAndroidReleaseSources,
  CYBERSARAH_ANDROID_PACKAGE,
} from "@/lib/android-release-preflight-logic";

const fixture = {
  capacitorConfig: `const config = { appId: "${CYBERSARAH_ANDROID_PACKAGE}" };`,
  androidGradle: `applicationId "${CYBERSARAH_ANDROID_PACKAGE}"\nversionCode 20702\nversionName "2.7.2"`,
  expoConfig: `const rawBundleId = "${CYBERSARAH_ANDROID_PACKAGE}";\n  version: "2.7.2",`,
  manifest: '<activity android:exported="true" /> <uses-permission android:name="android.permission.INTERNET" />',
};

describe("Android Release Preflight", () => {
  it("accepts a complete, version-consistent release setup", () => {
    expect(validateAndroidReleaseSources(fixture, "2.7.2")).toEqual([]);
  });

  it("rejects mismatched Android/Expo app identifiers and version metadata", () => {
    const wrong = {
      ...fixture,
      androidGradle: fixture.androidGradle.replace(CYBERSARAH_ANDROID_PACKAGE, "com.other.app"),
      expoConfig: fixture.expoConfig.replace("2.7.2", "2.7.1"),
    };
    expect(validateAndroidReleaseSources(wrong, "2.7.2")).toEqual(
      expect.arrayContaining(["Gradle package ID mismatch", "Android/Expo versionName mismatch"]),
    );
  });

  it("rejects missing critical Android manifest requirements", () => {
    const problems = validateAndroidReleaseSources({ ...fixture, manifest: "<manifest/>" }, "2.7.2");
    expect(problems).toContain("Android INTERNET permission missing");
    expect(problems).toContain("Android launcher export missing");
  });

  it("rejects version collisions and overflow across Android version-code boundaries", () => {
    expect(androidVersionCode("2.7.2")).toBe(20702);
    expect(androidVersionCode("2.7.100")).toBeNull();
    expect(androidVersionCode("2.100.0")).toBeNull();
    expect(androidVersionCode("2.07.2")).toBeNull();
    expect(androidVersionCode("0.0.0")).toBeNull();
    expect(androidVersionCode("x.y.z")).toBeNull();
    expect(androidVersionCode("999999.1.1")).toBeNull();
  });

  it("reports missing signing secret names without ever exposing values", () => {
    const supplied = { ANDROID_KEYSTORE_BASE64: "base64", ANDROID_KEYSTORE_PASSWORD: "s3cret" };
    expect(missingAndroidSigningSecrets(supplied)).toEqual(["ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]);
    expect(JSON.stringify(missingAndroidSigningSecrets(supplied))).not.toContain("s3cret");
    expect(missingAndroidSigningSecrets({
      ...supplied, ANDROID_KEY_ALIAS: "release", ANDROID_KEY_PASSWORD: "password",
    })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateAndroidRelease } from "../lib/android-release-logic";

describe("android release logic", () => {
  it("accepts a portrait release with required assets", () => {
    expect(evaluateAndroidRelease({
      packageName: "com.app.customaistudiomobile",
      version: "1.0.0",
      orientation: "portrait",
      hasLauncherIcon: true,
      hasSplashIcon: true,
    })).toEqual({ ready: true, issues: [] });
  });

  it("reports all missing release requirements", () => {
    expect(evaluateAndroidRelease({ packageName: "Bad.Package", version: "1", orientation: "landscape", hasLauncherIcon: false, hasSplashIcon: false })).toEqual({
      ready: false,
      issues: ["android-package", "version", "orientation", "launcher-icon", "splash-icon"],
    });
  });
});

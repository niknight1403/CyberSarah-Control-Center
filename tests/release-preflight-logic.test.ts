import { describe, expect, it } from "vitest";
import { validateReleasePreflight } from "../lib/release-preflight-logic";

describe("release preflight logic", () => {
  it("accepts a valid portrait Android release", () => {
    const result = validateReleasePreflight({
      appName: "CyberSarah Control Center",
      version: "1.0.0",
      androidPackage: "com.app.customaistudiomobile",
      orientation: "portrait",
      buildCommand: "pnpm build",
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.normalized.version).toBe("1.0.0");
  });

  it("rejects invalid release metadata without exposing input values", () => {
    const result = validateReleasePreflight({
      appName: "",
      version: "1",
      androidPackage: "Com.Invalid",
      orientation: "landscape",
      buildCommand: "",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual([
      "missing-app-name",
      "invalid-version",
      "invalid-android-package",
      "invalid-orientation",
      "missing-build-command",
    ]);
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("accepts prerelease semantic versions", () => {
    const result = validateReleasePreflight({
      appName: "CyberSarah Control Center",
      version: "1.1.0-rc.1",
      androidPackage: "com.cybersarah.controlcenter",
      orientation: "portrait",
      buildCommand: "pnpm build",
    });

    expect(result.ok).toBe(true);
  });
});

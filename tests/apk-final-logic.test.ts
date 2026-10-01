import { describe, expect, it } from "vitest";
import {
  evaluateApkFinalReport,
  SERIE_G_MAX_APK_SIZE_MB,
  validateApkArtifact,
} from "../lib/apk-final-logic";

describe("APK Final Logic (Sprint 380)", () => {
  it("validates individual APK artifacts against size budget and signing status", () => {
    const validArtifact = validateApkArtifact({
      name: "CyberSarah-ControlCenter-v2.6.1-admin.apk",
      sizeBytes: 7.9 * 1024 * 1024,
      signed: true,
      type: "admin-apk",
    });

    expect(validArtifact.valid).toBe(true);
    expect(validArtifact.sizeMB).toBe(7.9);

    const oversizedArtifact = validateApkArtifact({
      name: "Huge-App.apk",
      sizeBytes: 30 * 1024 * 1024,
      signed: true,
      type: "admin-apk",
    });

    expect(oversizedArtifact.valid).toBe(false);

    const unsignedArtifact = validateApkArtifact({
      name: "Unsigned.apk",
      sizeBytes: 5 * 1024 * 1024,
      signed: false,
      type: "admin-apk",
    });

    expect(unsignedArtifact.valid).toBe(false);
  });

  it("evaluates a full APK final report with web export smoke", () => {
    const report = evaluateApkFinalReport({
      artifacts: [
        {
          name: "CyberSarah-ControlCenter-v2.6.1-admin.apk",
          sizeBytes: 7.9 * 1024 * 1024,
          signed: true,
          type: "admin-apk",
        },
        {
          name: "CyberSarah-ControlCenter-v2.6.1-dev.apk",
          sizeBytes: 9.3 * 1024 * 1024,
          signed: true,
          type: "dev-apk",
        },
        {
          name: "CyberSarah-ControlCenter-v2.6.1-release.aab",
          sizeBytes: 7.7 * 1024 * 1024,
          signed: true,
          type: "release-aab",
        },
      ],
      webExport: {
        domMounted: true,
        loginScreenRendered: true,
        navigationRoutesCount: 12,
        trpcGatesChecked: true,
        liveHealthOk: true,
      },
      maxSizeBudgetMB: SERIE_G_MAX_APK_SIZE_MB,
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.honestOwnerHandoffs.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  extractReleaseNotesFromChangelog,
  validateReleaseManifest,
} from "../lib/release-final-logic";

describe("Release Final Logic (Sprint 381)", () => {
  const sampleChangelog = `
# Changelog

## 30.09.2026 — Sprint 383: Abschluss-Validierung alles grün (Serie J — Batch 20)
Validierungsergebnisse und Details...

## 28.09.2026 — Sprint 381: Release v4.2.1 (Serie J — Batch 20)
- Sprint 381 (Release): Ehrliche Versionsnummer v4.2.1 per release-version-logic.
- Assets: admin.apk, dev.apk, release.aab angehängt.
`;

  it("extracts release notes for a target version tag from changelog", () => {
    const res = extractReleaseNotesFromChangelog(sampleChangelog, "v4.2.1");
    expect(res.found).toBe(true);
    expect(res.notes).toContain("Sprint 381 (Release)");
  });

  it("validates a complete release manifest with tags, commits, notes and assets", () => {
    const result = validateReleaseManifest({
      versionTag: "v4.2.1",
      commitSha: "a6c25a612345678",
      changelogContent: sampleChangelog,
      attachedAssets: [
        { name: "CyberSarah-ControlCenter-v2.6.1-admin.apk", sizeBytes: 8000000, contentType: "application/vnd.android.package-archive" },
        { name: "CyberSarah-ControlCenter-v2.6.1-dev.apk", sizeBytes: 9000000, contentType: "application/vnd.android.package-archive" },
        { name: "CyberSarah-ControlCenter-v2.6.1-release.aab", sizeBytes: 7000000, contentType: "application/octet-stream" },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.notesExtracted).toBe(true);
    expect(result.assetsValid).toBe(true);
  });

  it("reports issues if release assets or release notes are missing", () => {
    const invalidResult = validateReleaseManifest({
      versionTag: "invalid-tag",
      commitSha: "short",
      changelogContent: "No matching notes here",
      attachedAssets: [],
    });

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.issues.length).toBeGreaterThan(0);
  });
});

/**
 * Release-Final & Release-Notes Logik (rein, testbar) — Sprint 381.
 *
 * Verarbeitet Release-Tags (SemVer), extrahiert Release-Notes aus
 * CHANGELOG.md und validiert angehängte Release-Assets.
 */

export interface ReleaseAssetInput {
  name: string;
  sizeBytes: number;
  contentType: string;
}

export interface ReleaseManifestInput {
  versionTag: string; // e.g. "v4.2.1"
  commitSha: string;
  changelogContent: string;
  attachedAssets: ReleaseAssetInput[];
}

export interface ReleaseValidationResult {
  valid: boolean;
  versionTag: string;
  commitSha: string;
  notesExtracted: boolean;
  notesSummary: string;
  assetsValid: boolean;
  issues: string[];
}

export function extractReleaseNotesFromChangelog(
  changelogContent: string,
  targetVersion: string,
): { found: boolean; notes: string } {
  if (!changelogContent || !targetVersion) {
    return { found: false, notes: "" };
  }

  const normalizedTag = targetVersion.replace(/^v/, "");
  const lines = changelogContent.split("\n");
  let capturing = false;
  const capturedLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (line.includes(normalizedTag) || line.includes(targetVersion)) {
        capturing = true;
        capturedLines.push(line);
        continue;
      } else if (capturing) {
        // Next section reached
        break;
      }
    }
    if (capturing) {
      capturedLines.push(line);
    }
  }

  const found = capturedLines.length > 0;
  const notes = found ? capturedLines.join("\n").trim() : "";
  return { found, notes };
}

export function validateReleaseManifest(
  input: ReleaseManifestInput,
): ReleaseValidationResult {
  const issues: string[] = [];

  // Version format check
  if (!/^v\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(input.versionTag)) {
    issues.push(`Invalid version tag format: ${input.versionTag}. Must be vX.Y.Z`);
  }

  // Commit SHA check
  if (!input.commitSha || input.commitSha.length < 7) {
    issues.push("Invalid or missing commit SHA.");
  }

  // Changelog extraction check
  const notesResult = extractReleaseNotesFromChangelog(
    input.changelogContent,
    input.versionTag,
  );
  if (!notesResult.found) {
    issues.push(`Release notes for ${input.versionTag} not found in CHANGELOG.md`);
  }

  // Assets check (expect admin.apk, dev.apk, release.aab or similar)
  const requiredAssetSubstrings = ["admin", "dev", "aab"];
  const assetNames = input.attachedAssets.map((a) => a.name.toLowerCase());
  let assetsValid = true;

  for (const req of requiredAssetSubstrings) {
    const hasReq = assetNames.some((name) => name.includes(req));
    if (!hasReq) {
      assetsValid = false;
      issues.push(`Missing required release asset containing '${req}'`);
    }
  }

  const valid = issues.length === 0;

  return {
    valid,
    versionTag: input.versionTag,
    commitSha: input.commitSha,
    notesExtracted: notesResult.found,
    notesSummary: notesResult.notes.slice(0, 300),
    assetsValid,
    issues,
  };
}
